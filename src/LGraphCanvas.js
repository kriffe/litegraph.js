import {CONSTANTS} from './Constants.js'
import {ContextMenu} from './ContextMenu.js'
import {isValidConnection, overlapBounding, isInsideRectangle, getTime, distance} from './MathHelpers.js'

//* ********************************************************************************
// LGraphCanvas: LGraph renderer CLASS
//* ********************************************************************************

/**
* The Global Scope. It contains all the registered node classes.
* Valid callbacks are: onNodeSelected, onNodeDeselected, onShowNodePanel, onNodeDblClicked
*
* @class LGraphCanvas
* @constructor
* @param {HTMLCanvas} canvas the canvas where you want to render (it accepts a selector in string format or the canvas element itself)
* @param {LGraph} graph [optional]
* @param {Object} options [optional] { skip_rendering, autoresize }
*/
var LGraphCanvas = function (canvas, graph, options) {
  options = options || {}

// if(graph === undefined)
// throw ("No graph assigned");

  if (canvas && canvas.constructor === String) { canvas = document.querySelector(canvas) }

  this.max_zoom = 10
  this.min_zoom = 0.1

  this.title_text_font = 'bold 14px Arial'
  this.inner_text_font = 'normal 12px Arial'
  this.default_link_color = '#AAC'

  this.highquality_render = true
  this.editor_alpha = 1 // used for transition
  this.pause_rendering = false
  this.render_shadows = true
  this.clear_background = true

  this.render_only_selected = true
  this.live_mode = false
  this.show_info = true
  this.allow_dragcanvas = true
  this.allow_dragnodes = true
  this.allow_interaction = true // allow to control widgets, buttons, collapse, etc

  this.always_render_background = false
  this.render_connections_shadows = false // too much cpu
  this.render_connections_border = true
  this.render_curved_connections = true
  this.render_connection_arrows = true

  this.connections_width = 3

// link canvas and graph
  // this.graph = graph        // ToDo: Deprecate

  // this._graph_stack = []    // ToDo: Depreacate
  this.graphStack = [graph]    //* Stack of graphs and sub graphs. Last item is active
  // if (graph) { graph.attachCanvas(this) }

  this.setCanvas(canvas)
  this.clear()

  if (!options.skip_render) { this.startRendering() }

  this.autoresize = options.autoresize
}

LGraphCanvas.link_type_colors = {'-1': '#F85', 'number': '#AAC', 'node': '#DCA'}

/**
* clears all the data inside
*
* @method clear
*/
LGraphCanvas.prototype.clear = function () {
  this.frame = 0
  this.last_draw_time = 0
  this.render_time = 0
  this.fps = 0

  this.scale = 1
  this.offset = [0, 0]

  this.selected_nodes = {}
  this.node_dragged = null
  this.node_over = null
  this.node_capturing_input = null
  this.connecting_node = null

  this.dirty_canvas = true
  this.dirty_bgcanvas = true
  this.dirty_area = null

  this.node_in_panel = null

  this.last_mouse = [0, 0]
  this.last_mouseclick = 0

  if (this.onClear) { this.onClear() }
// this.UIinit();
}

/**
* assigns a graph, you can reasign graphs to the same canvas
*
* @method setGraph
* @param {LGraph} graph
*/
LGraphCanvas.prototype.setGraph = function (newGraph, skip_clear) {
  var graph = this.getGraph()
  if (graph == newGraph) { return }

  if (!skip_clear) { this.clear() }

  // if (!newGraph) {
  //   graph.detachCanvas(this)
  //   return
  // }

  // newGraph.attachCanvas(this)
  this.setDirty(true, true)
}

/**
* opens a graph contained inside a node in the current graph
*
* @method openSubgraph
* @param {LGraph} graph
*/
LGraphCanvas.prototype.openSubgraph = function (graph) {
  if (!graph) { throw new Error('graph cannot be null') }

  // if (this.graph == graph) { throw ('graph cannot be the same') }

  this.clear()

  this.graphStack.push(graph)
  // if (this.graph) {
  //   if (!this._graph_stack) { this._graph_stack = [] }
  //   this._graph_stack.push(this.graph)
  // }

  // graph.attachCanvas(this)
  this.setDirty(true, true)
}

/**
* closes a subgraph contained inside a node
*
* @method closeSubgraph
* @param {LGraph} assigns a graph
*/
LGraphCanvas.prototype.closeSubgraph = function () {
  // if (!this._graph_stack || this._graph_stack.length === 0) { return }
  // var graph = this._graph_stack.pop()
  if (this.graphStack.length > 1) {
    this.graphStack.pop()
  }
  // graph.attachCanvas(this)
  this.setDirty(true, true)
}

/**
* assigns a canvas
*
* @method setCanvas
* @param {Canvas} assigns a canvas (also accepts the ID of the element (not a selector)
*/
LGraphCanvas.prototype.setCanvas = function (canvas, skip_events) {
  var that = this

  if (canvas) {
    if (canvas.constructor === String) {
      canvas = document.getElementById(canvas)
      if (!canvas) { throw new Error('Error creating LiteGraph canvas: Canvas not found') }
    }
  }

  if (canvas === this.canvas) { return }

  if (!canvas && this.canvas) {
// maybe detach events from old_canvas
    if (!skip_events) { this.unbindEvents() }
  }

  this.canvas = canvas

  if (!canvas) { return }

// this.canvas.tabindex = "1000";
  canvas.className += ' lgraphcanvas'
  canvas.data = this

// bg canvas: used for non changing stuff
  this.bgcanvas = null
  if (!this.bgcanvas) {
    this.bgcanvas = document.createElement('canvas')
    this.bgcanvas.width = this.canvas.width
    this.bgcanvas.height = this.canvas.height
  }

  if (canvas.getContext == null) {
    if (canvas.localName != 'canvas') { throw ('Element supplied for LGraphCanvas must be a <canvas> element, you passed a ' + canvas.localName) }
    throw new Error('This browser doesnt support Canvas')
  }

  var ctx = this.ctx = canvas.getContext('2d')
  if (ctx == null) {
    console.warn('This canvas seems to be WebGL, enabling WebGL renderer')
    this.enableWebGL()
  }

// input:  (move and up could be unbinded)
  this._mousemove_callback = this.processMouseMove.bind(this)
  this._mouseup_callback = this.processMouseUp.bind(this)

  if (!skip_events) { this.bindEvents() }
}

// used in some events to capture them
LGraphCanvas.prototype._doNothing = function doNothing (e) { e.preventDefault(); return false }
LGraphCanvas.prototype._doReturnTrue = function doNothing (e) { e.preventDefault(); return true }

LGraphCanvas.prototype.bindEvents = function () {
  if (this._events_binded) {
    console.warn('LGraphCanvas: events already binded')
    return
  }

  var canvas = this.canvas

  this._mousedown_callback = this.processMouseDown.bind(this)
  this._mousewheel_callback = this.processMouseWheel.bind(this)

  canvas.addEventListener('mousedown', this._mousedown_callback, true) // down do not need to store the binded
  canvas.addEventListener('mousemove', this._mousemove_callback)
  canvas.addEventListener('mousewheel', this._mousewheel_callback, false)

  canvas.addEventListener('contextmenu', this._doNothing)
  canvas.addEventListener('DOMMouseScroll', this._mousewheel_callback, false)

// touch events
// if( 'touchstart' in document.documentElement )
  {
    canvas.addEventListener('touchstart', this.touchHandler, true)
    canvas.addEventListener('touchmove', this.touchHandler, true)
    canvas.addEventListener('touchend', this.touchHandler, true)
    canvas.addEventListener('touchcancel', this.touchHandler, true)
  }

// Keyboard ******************
  this._key_callback = this.processKey.bind(this)

  canvas.addEventListener('keydown', this._key_callback)
  canvas.addEventListener('keyup', this._key_callback)

// Droping Stuff over nodes ************************************
  this._ondrop_callback = this.processDrop.bind(this)

  canvas.addEventListener('dragover', this._doNothing, false)
  canvas.addEventListener('dragend', this._doNothing, false)
  canvas.addEventListener('drop', this._ondrop_callback, false)
  canvas.addEventListener('dragenter', this._doReturnTrue, false)

  this._events_binded = true
}

LGraphCanvas.prototype.unbindEvents = function () {
  if (!this._events_binded) {
    console.warn('LGraphCanvas: no events binded')
    return
  }

  this.canvas.removeEventListener('mousedown', this._mousedown_callback)
  this.canvas.removeEventListener('mousewheel', this._mousewheel_callback)
  this.canvas.removeEventListener('DOMMouseScroll', this._mousewheel_callback)
  this.canvas.removeEventListener('keydown', this._key_callback)
  this.canvas.removeEventListener('keyup', this._key_callback)
  this.canvas.removeEventListener('contextmenu', this._doNothing)
  this.canvas.removeEventListener('drop', this._ondrop_callback)
  this.canvas.removeEventListener('dragenter', this._doReturnTrue)

  this.canvas.removeEventListener('touchstart', this.touchHandler)
  this.canvas.removeEventListener('touchmove', this.touchHandler)
  this.canvas.removeEventListener('touchend', this.touchHandler)
  this.canvas.removeEventListener('touchcancel', this.touchHandler)

  this._mousedown_callback = null
  this._mousewheel_callback = null
  this._key_callback = null
  this._ondrop_callback = null

  this._events_binded = false
}

LGraphCanvas.getFileExtension = function (url) {
  var question = url.indexOf('?')
  if (question != -1) { url = url.substr(0, question) }
  var point = url.lastIndexOf('.')
  if (point == -1) { return '' }
  return url.substr(point + 1).toLowerCase()
}

// this file allows to render the canvas using WebGL instead of Canvas2D
// this is useful if you plant to render 3D objects inside your nodes
LGraphCanvas.prototype.enableWebGL = function () {
  if (typeof (GL) === undefined) { throw ('litegl.js must be included to use a WebGL canvas') }
  if (typeof (enableWebGLCanvas) === undefined) { throw ('webglCanvas.js must be included to use this feature') }

  this.gl = this.ctx = enableWebGLCanvas(this.canvas)
  this.ctx.webgl = true
  this.bgcanvas = this.canvas
  this.bgctx = this.gl

/*
GL.create({ canvas: this.bgcanvas });
this.bgctx = enableWebGLCanvas( this.bgcanvas );
window.gl = this.gl;
*/
}

/*
LGraphCanvas.prototype.UIinit = function()
{
var that = this;
$("#node-console input").change(function(e)
{
if(e.target.value == "")
return;

var node = that.node_in_panel;
if(!node)
return;

node.trace("] " + e.target.value, "#333");
if(node.onConsoleCommand)
{
if(!node.onConsoleCommand(e.target.value))
node.trace("command not found", "#A33");
}
else if (e.target.value == "info")
{
node.trace("Special methods:");
for(var i in node)
{
if(typeof(node[i]) == "function" && LGraphNode.prototype[i] == null && i.substr(0,2) != "on" && i[0] != "_")
node.trace(" + " + i);
}
}
else
{
try
{
eval("var _foo = function() { return ("+e.target.value+"); }");
var result = _foo.call(node);
if(result)
node.trace(result.toString());
delete window._foo;
}
catch(err)
{
node.trace("error: " + err, "#A33");
}
}

this.value = "";
});
}
*/

/**
* marks as dirty the canvas, this way it will be rendered again
*
* @class LGraphCanvas
* @method setDirty
* @param {bool} fgcanvas if the foreground canvas is dirty (the one containing the nodes)
* @param {bool} bgcanvas if the background canvas is dirty (the one containing the wires)
*/
LGraphCanvas.prototype.setDirty = function (fgcanvas, bgcanvas) {
  if (fgcanvas) { this.dirty_canvas = true }
  if (bgcanvas) { this.dirty_bgcanvas = true }
}

/**
* Used to attach the canvas in a popup
*
* @method getCanvasWindow
* @return {window} returns the window where the canvas is attached (the DOM root node)
*/
LGraphCanvas.prototype.getCanvasWindow = function () {
  if (!this.canvas) { return window }
  var doc = this.canvas.ownerDocument
  return doc.defaultView || doc.parentWindow
}

/**
* starts rendering the content of the canvas when needed
*
* @method startRendering
*/
LGraphCanvas.prototype.startRendering = function () {
  if (this.is_rendering) return // already rendering

  this.is_rendering = true
  renderFrame.call(this)

  function renderFrame () {
    if (!this.pause_rendering) { this.draw() }

    var window = this.getCanvasWindow()
    if (this.is_rendering) { window.requestAnimationFrame(renderFrame.bind(this)) }
  }
}

/**
* stops rendering the content of the canvas (to save resources)
*
* @method stopRendering
*/
LGraphCanvas.prototype.stopRendering = function () {
  this.is_rendering = false
/*
if(this.rendering_timer_id)
{
clearInterval(this.rendering_timer_id);
this.rendering_timer_id = null;
}
*/
}

/**
 * @returns {LGraph}
 */
LGraphCanvas.prototype.getGraph = function () {
  var lastElementIndex = this.graphStack.length - 1
  if (lastElementIndex >= 0) {
    return this.graphStack[lastElementIndex]
  } else {
    return undefined
  }
}

LGraphCanvas.prototype.processMouseDown = function (e) {
  var graph = this.getGraph()
  if (!graph) { return }

  this.adjustMouseEvent(e)

  var ref_window = this.getCanvasWindow()
  var document = ref_window.document
  LGraphCanvas.active_canvas = this     //ToDo: Store inside graph instead? Move all global functions to prototype

// move mouse move event to the window in case it drags outside of the canvas
  this.canvas.removeEventListener('mousemove', this._mousemove_callback)
  ref_window.document.addEventListener('mousemove', this._mousemove_callback, true) // catch for the entire window
  ref_window.document.addEventListener('mouseup', this._mouseup_callback, true)

  var n = graph.getNodeOnPos(e.canvasX, e.canvasY, this.visible_nodes)
  var skip_dragging = false

  closeAllContextMenus(ref_window)

  if (e.which === 1) { // left button mouse
    if (!e.shiftKey) { // REFACTOR: integrate with function
          // no node or another node selected
      if (!n || !this.selected_nodes[n.id]) {
        var todeselect = []
        for (var i in this.selected_nodes) {
          if (this.selected_nodes[i] != n) { todeselect.push(this.selected_nodes[i]) }
        }
              // two passes to avoid problems modifying the container
        for (var i in todeselect) { this.processNodeDeselected(todeselect[i]) }
      }
    }
    var clicking_canvas_bg = false

// when clicked on top of a node
// and it is not interactive
    if (n && this.allow_interaction) {
      if (!this.live_mode && !n.flags.pinned) { this.bringToFront(n) } // if it wasnt selected?
      var skip_action = false

// not dragging mouse to connect two slots
      if (!this.connecting_node && !n.flags.collapsed && !this.live_mode) {
// search for outputs
        if (n.outputs) {
          for (var i = 0, l = n.outputs.length; i < l; ++i) {
            var output = n.outputs[i]
            var link_pos = n.getConnectionPos(false, i)
            if (isInsideRectangle(e.canvasX, e.canvasY, link_pos[0] - 10, link_pos[1] - 5, 20, 10)) {
              this.connecting_node = n
              this.connecting_output = output
              this.connecting_pos = n.getConnectionPos(false, i)
              this.connecting_slot = i

              skip_action = true
              break
            }
          }
        }

// search for inputs
        if (n.inputs) {
          for (var i = 0, l = n.inputs.length; i < l; ++i) {
            var input = n.inputs[i]
            var link_pos = n.getConnectionPos(true, i)
            if (isInsideRectangle(e.canvasX, e.canvasY, link_pos[0] - 10, link_pos[1] - 5, 20, 10)) {
              if (input.link !== null) {
                n.disconnectInput(i)
                this.dirty_bgcanvas = true
                skip_action = true
              }
            }
          }
        }

// Search for corner
        if (!skip_action && isInsideRectangle(e.canvasX, e.canvasY, n.pos[0] + n.size[0] - 5, n.pos[1] + n.size[1] - 5, 5, 5)) {
          this.resizing_node = n
          this.canvas.style.cursor = 'se-resize'
          skip_action = true
        }
      }

// Search for corner
      if (!skip_action && isInsideRectangle(e.canvasX, e.canvasY, n.pos[0], n.pos[1] - CONSTANTS.NODE_TITLE_HEIGHT, CONSTANTS.NODE_TITLE_HEIGHT, CONSTANTS.NODE_TITLE_HEIGHT)) {
        n.collapse()
        skip_action = true
      }

// it wasnt clicked on the links boxes
      if (!skip_action) {
        var block_drag_node = false

// double clicking
        var now = getTime()
        if ((now - this.last_mouseclick) < 300 && this.selected_nodes[n.id]) {
// double click node
          if (n.onDblClick) { n.onDblClick(e) }
          this.processNodeDblClicked(n)
          block_drag_node = true
        }

// if do not capture mouse

        if (n.onMouseDown && n.onMouseDown(e, [e.canvasX - n.pos[0], e.canvasY - n.pos[1]])) { block_drag_node = true } else if (this.live_mode) {
          clicking_canvas_bg = true
          block_drag_node = true
        }

        if (!block_drag_node) {
          if (this.allow_dragnodes) { this.node_dragged = n }

          if (!this.selected_nodes[n.id]) { this.processNodeSelected(n, e) }
        }

        this.dirty_canvas = true
      }
    } else { clicking_canvas_bg = true }

    if (clicking_canvas_bg && this.allow_dragcanvas) {
      this.dragging_canvas = true
    }
  } else if (e.which == 2) // middle button
{

  } else if (e.which == 3) // right button
{
    this.processContextMenu(n, e)
  }

// TODO
// if(this.node_selected != prev_selected)
// this.onNodeSelectionChange(this.node_selected);

  this.last_mouse[0] = e.localX
  this.last_mouse[1] = e.localY
  this.last_mouseclick = getTime()
  this.canvas_mouse = [e.canvasX, e.canvasY]

/*
if( (this.dirty_canvas || this.dirty_bgcanvas) && this.rendering_timer_id == null)
this.draw();
*/

  graph.change()

// this is to ensure to defocus(blur) if a text input element is on focus
  if (!ref_window.document.activeElement || (ref_window.document.activeElement.nodeName.toLowerCase() != 'input' && ref_window.document.activeElement.nodeName.toLowerCase() != 'textarea')) { e.preventDefault() }
  e.stopPropagation()

  if (this.onMouseDown) { this.onMouseDown(e) }

  return false
}

LGraphCanvas.prototype.processMouseMove = function (e) {
  var graph = this.getGraph()
  if (this.autoresize) { this.resize() }

  if (!graph) { return }

  LGraphCanvas.active_canvas = this
  this.adjustMouseEvent(e)
  var mouse = [e.localX, e.localY]
  var delta = [mouse[0] - this.last_mouse[0], mouse[1] - this.last_mouse[1]]
  this.last_mouse = mouse
  this.canvas_mouse = [e.canvasX, e.canvasY]

  if (this.dragging_canvas) {
    this.offset[0] += delta[0] / this.scale
    this.offset[1] += delta[1] / this.scale
    this.dirty_canvas = true
    this.dirty_bgcanvas = true
  } else if (this.allow_interaction) {
    if (this.connecting_node) { this.dirty_canvas = true }

// get node over
    var n = graph.getNodeOnPos(e.canvasX, e.canvasY, this.visible_nodes)

// remove mouseover flag
    for (var i = 0, l = graph._nodes.length; i < l; ++i) {
      if (graph._nodes[i].mouseOver && n != graph._nodes[i]) {
// mouse leave
        graph._nodes[i].mouseOver = false
        if (this.node_over && this.node_over.onMouseLeave) { this.node_over.onMouseLeave(e) }
        this.node_over = null
        this.dirty_canvas = true
      }
    }

    // mouse over a node
    if (n) {
      // this.canvas.style.cursor = "move";
      if (!n.mouseOver) {
        // mouse enter
        n.mouseOver = true
        this.node_over = n
        this.dirty_canvas = true

        if (n.onMouseEnter) n.onMouseEnter(e)
      }

      if (n.onMouseMove) n.onMouseMove(e)

// on top of input
      if (this.connecting_node) {
        var pos = this._highlight_input || [0, 0] // to store the output of isOverNodeInput

        if (this.isOverNodeBox(n, e.canvasX, e.canvasY)) {
// mouse on top of the corner box, dont know what to do
        } else {
          var slot = this.isOverNodeInput(n, e.canvasX, e.canvasY, pos)
          if (slot != -1 && n.inputs[slot]) {
            var slot_type = n.inputs[slot].type
            if (isValidConnection(this.connecting_output.type, slot_type)) { this._highlight_input = pos }
          } else { this._highlight_input = null }
        }
      }

// Search for corner
      if (isInsideRectangle(e.canvasX, e.canvasY, n.pos[0] + n.size[0] - 5, n.pos[1] + n.size[1] - 5, 5, 5)) { this.canvas.style.cursor = 'se-resize' } else { this.canvas.style.cursor = null }
    } else { this.canvas.style.cursor = null }

    if (this.node_capturing_input && this.node_capturing_input != n && this.node_capturing_input.onMouseMove) {
      this.node_capturing_input.onMouseMove(e)
    }

    if (this.node_dragged && !this.live_mode) {
/*
this.node_dragged.pos[0] += delta[0] / this.scale;
this.node_dragged.pos[1] += delta[1] / this.scale;
this.node_dragged.pos[0] = Math.round(this.node_dragged.pos[0]);
this.node_dragged.pos[1] = Math.round(this.node_dragged.pos[1]);
*/

      for (var i in this.selected_nodes) {
        var n = this.selected_nodes[i]

        n.pos[0] += delta[0] / this.scale
        n.pos[1] += delta[1] / this.scale
// n.pos[0] = Math.round(n.pos[0]);
// n.pos[1] = Math.round(n.pos[1]);
      }

      this.dirty_canvas = true
      this.dirty_bgcanvas = true
    }

    if (this.resizing_node && !this.live_mode) {
      this.resizing_node.size[0] += delta[0] / this.scale
      this.resizing_node.size[1] += delta[1] / this.scale
      var max_slots = Math.max(this.resizing_node.inputs ? this.resizing_node.inputs.length : 0, this.resizing_node.outputs ? this.resizing_node.outputs.length : 0)
      if (this.resizing_node.size[1] < max_slots * CONSTANTS.NODE_SLOT_HEIGHT + 4) { this.resizing_node.size[1] = max_slots * CONSTANTS.NODE_SLOT_HEIGHT + 4 }
      if (this.resizing_node.size[0] < CONSTANTS.NODE_MIN_WIDTH) { this.resizing_node.size[0] = CONSTANTS.NODE_MIN_WIDTH }

      this.canvas.style.cursor = 'se-resize'
      this.dirty_canvas = true
      this.dirty_bgcanvas = true
    }
  }

/*
if((this.dirty_canvas || this.dirty_bgcanvas) && this.rendering_timer_id == null)
this.draw();
*/

  e.preventDefault()
// e.stopPropagation();
  return false
// this is not really optimal
// this.graph.change();
}

LGraphCanvas.prototype.processMouseUp = function (e) {
  var graph = this.getGraph()
  if (!graph) { return }

  var window = this.getCanvasWindow()
  var document = window.document
  LGraphCanvas.active_canvas = this

// restore the mousemove event back to the canvas
  document.removeEventListener('mousemove', this._mousemove_callback, true)
  this.canvas.addEventListener('mousemove', this._mousemove_callback, true)
  document.removeEventListener('mouseup', this._mouseup_callback, true)

  this.adjustMouseEvent(e)

  if (e.which == 1) // left button
{
// dragging a connection
    if (this.connecting_node) {
      this.dirty_canvas = true
      this.dirty_bgcanvas = true

      var node = graph.getNodeOnPos(e.canvasX, e.canvasY, this.visible_nodes)

// node below mouse
      if (node) {
        if (this.connecting_output.type == CONSTANTS.EVENT && this.isOverNodeBox(node, e.canvasX, e.canvasY)) {
          this.connecting_node.connect(this.connecting_slot, node, CONSTANTS.EVENT)
        } else {
// slot below mouse? connect
          var slot = this.isOverNodeInput(node, e.canvasX, e.canvasY)
          if (slot != -1) {
            this.connecting_node.connect(this.connecting_slot, node, slot)
          } else { // not on top of an input
            var input = node.getInputInfo(0)
// auto connect
            if (this.connecting_output.type === CONSTANTS.EVENT) { this.connecting_node.connect(this.connecting_slot, node, CONSTANTS.EVENT) } else
if (input && !input.link && input.type == this.connecting_output.type) // toLowerCase missing
{ this.connecting_node.connect(this.connecting_slot, node, 0) }
          }
        }
      }

      this.connecting_output = null
      this.connecting_pos = null
      this.connecting_node = null
      this.connecting_slot = -1
    }// not dragging connection
    else if (this.resizing_node) {
      this.dirty_canvas = true
      this.dirty_bgcanvas = true
      this.resizing_node = null
    } else if (this.node_dragged) // node being dragged?
{
      this.dirty_canvas = true
      this.dirty_bgcanvas = true
      this.node_dragged.pos[0] = Math.round(this.node_dragged.pos[0])
      this.node_dragged.pos[1] = Math.round(this.node_dragged.pos[1])
      if (graph.config.align_to_grid) { this.node_dragged.alignToGrid() }
      this.node_dragged = null
    } else // no node being dragged
{
      this.dirty_canvas = true
      this.dragging_canvas = false

      if (this.node_over && this.node_over.onMouseUp) { this.node_over.onMouseUp(e, [e.canvasX - this.node_over.pos[0], e.canvasY - this.node_over.pos[1]]) }
      if (this.node_capturing_input && this.node_capturing_input.onMouseUp) { this.node_capturing_input.onMouseUp(e, [e.canvasX - this.node_capturing_input.pos[0], e.canvasY - this.node_capturing_input.pos[1]]) }
    }
  } else if (e.which == 2) // middle button
{
// trace("middle");
    this.dirty_canvas = true
    this.dragging_canvas = false
  } else if (e.which == 3) // right button
{
// trace("right");
    this.dirty_canvas = true
    this.dragging_canvas = false
  }

/*
if((this.dirty_canvas || this.dirty_bgcanvas) && this.rendering_timer_id == null)
this.draw();
*/

  graph.change()

  e.stopPropagation()
  e.preventDefault()
  return false
}

LGraphCanvas.prototype.processMouseWheel = function (e) {
  var graph = this.getGraph()
  if (!graph || !this.allow_dragcanvas) { return }

  var delta = (e.wheelDeltaY != null ? e.wheelDeltaY : e.detail * -60)

  this.adjustMouseEvent(e)

  var zoom = this.scale

  if (delta > 0) { zoom *= 1.1 } else if (delta < 0) { zoom *= 1 / (1.1) }

  this.setZoom(zoom, [ e.localX, e.localY ])

/*
if(this.rendering_timer_id == null)
this.draw();
*/

  graph.change()

  e.preventDefault()
  return false // prevent default
}

LGraphCanvas.prototype.isOverNodeBox = function (node, canvasx, canvasy) {
  var title_height = CONSTANTS.NODE_TITLE_HEIGHT
  if (isInsideRectangle(canvasx, canvasy, node.pos[0] + 2, node.pos[1] + 2 - title_height, title_height - 4, title_height - 4)) { return true }
  return false
}

LGraphCanvas.prototype.isOverNodeInput = function (node, canvasx, canvasy, slot_pos) {
  if (node.inputs) {
    for (var i = 0, l = node.inputs.length; i < l; ++i) {
      var input = node.inputs[i]
      var link_pos = node.getConnectionPos(true, i)
      if (isInsideRectangle(canvasx, canvasy, link_pos[0] - 10, link_pos[1] - 5, 20, 10)) {
        if (slot_pos) {
          slot_pos[0] = link_pos[0]
          slot_pos[1] = link_pos[1]
        }
        return i
      }
    }
  }
  return -1
}

LGraphCanvas.prototype.processKey = function (e) {
  var graph = this.getGraph()
  if (!graph) { return }

  var block_default = false

  if (e.type == 'keydown') {
// select all Control A
    if (e.keyCode == 65 && e.ctrlKey) {
      this.selectAllNodes()
      block_default = true
    }

// delete or backspace
    if (e.keyCode == 46 || e.keyCode == 8) {
      this.deleteSelectedNodes()
      block_default = true
    }

// collapse
// ...

// TODO
    if (this.selected_nodes) {
      for (var i in this.selected_nodes) {
        if (this.selected_nodes[i].onKeyDown) { this.selected_nodes[i].onKeyDown(e) }
      }
    }
  } else if (e.type == 'keyup') {
    if (this.selected_nodes) {
      for (var i in this.selected_nodes) {
        if (this.selected_nodes[i].onKeyUp) { this.selected_nodes[i].onKeyUp(e) }
      }
    }
  }

  graph.change()

  if (block_default) {
    e.preventDefault()
    return false
  }
}

LGraphCanvas.prototype.processDrop = function (e) {
  var graph = this.getGraph()
  e.preventDefault()
  this.adjustMouseEvent(e)

  var pos = [e.canvasX, e.canvasY]
  var node = graph.getNodeOnPos(pos[0], pos[1])

  if (!node) {
    var r = null
    if (this.onDropItem) { r = this.onDropItem(event) }
    if (!r) { this.checkDropItem(e) }
    return
  }

  if (node.onDropFile || node.onDropData) {
    var files = e.dataTransfer.files
    if (files && files.length) {
      for (var i = 0; i < files.length; i++) {
        var file = e.dataTransfer.files[0]
        var filename = file.name
        var ext = LGraphCanvas.getFileExtension(filename)
// console.log(file);

        if (node.onDropFile) { node.onDropFile(file) }

        if (node.onDropData) {
// prepare reader
          var reader = new FileReader()
          reader.onload = function (event) {
// console.log(event.target);
            var data = event.target.result
            node.onDropData(data, filename, file)
          }

// read data
          var type = file.type.split('/')[0]
          if (type == 'text' || type == '') { reader.readAsText(file) } else if (type == 'image') { reader.readAsDataURL(file) } else { reader.readAsArrayBuffer(file) }
        }
      }
    }
  }

  if (node.onDropItem) {
    if (node.onDropItem(event)) { return true }
  }

  if (this.onDropItem) { return this.onDropItem(event) }

  return false
}

// called if the graph doesnt have a default drop item behaviour
LGraphCanvas.prototype.checkDropItem = function (e) {
  var graph = this.getGraph()
  if (e.dataTransfer.files.length) {
    var file = e.dataTransfer.files[0]
    var ext = LGraphCanvas.getFileExtension(file.name).toLowerCase()
    var nodetype = node_types_by_file_extension[ext]
    if (nodetype) {
      var node = createNode(nodetype.type)
      node.pos = [e.canvasX, e.canvasY]
      graph.add(node)
      if (node.onDropFile) { node.onDropFile(file) }
    }
  }
}

LGraphCanvas.prototype.processNodeSelected = function (n, e) {
  n.selected = true
  if (n.onSelected) { n.onSelected() }

  if (e && e.shiftKey) // add to selection
{ this.selected_nodes[n.id] = n } else {
    this.selected_nodes = {}
    this.selected_nodes[ n.id ] = n
  }

  this.dirty_canvas = true

  if (this.onNodeSelected) { this.onNodeSelected(n) }

// if(this.node_in_panel) this.showNodePanel(n);
}

LGraphCanvas.prototype.processNodeDeselected = function (n) {
  n.selected = false
  if (n.onDeselected) { n.onDeselected() }

  delete this.selected_nodes[n.id]

  if (this.onNodeDeselected) { this.onNodeDeselected(n) }

  this.dirty_canvas = true
}

LGraphCanvas.prototype.processNodeDblClicked = function (n) {
  if (this.onShowNodePanel) { this.onShowNodePanel(n) }

  if (this.onNodeDblClicked) { this.onNodeDblClicked(n) }

  this.setDirty(true)
}

LGraphCanvas.prototype.selectNode = function (node) {
  this.deselectAllNodes()

  if (!node) { return }

  if (!node.selected && node.onSelected) { node.onSelected() }
  node.selected = true
  this.selected_nodes[ node.id ] = node
  this.setDirty(true)
}

LGraphCanvas.prototype.selectAllNodes = function () {
  var graph = this.getGraph()
  for (var i = 0; i < graph._nodes.length; ++i) {
    var n = graph._nodes[i]
    if (!n.selected && n.onSelected) { n.onSelected() }
    n.selected = true
    this.selected_nodes[graph._nodes[i].id] = n
  }

  this.setDirty(true)
}

LGraphCanvas.prototype.deselectAllNodes = function () {
  for (var i in this.selected_nodes) {
    var n = this.selected_nodes
    if (n.onDeselected) { n.onDeselected() }
    n.selected = false
  }
  this.selected_nodes = {}
  this.setDirty(true)
}

LGraphCanvas.prototype.deleteSelectedNodes = function () {
  var graph = this.getGraph()
  for (var i in this.selected_nodes) {
    var m = this.selected_nodes[i]
// if(m == this.node_in_panel) this.showNodePanel(null);
    graph.remove(m)
  }
  this.selected_nodes = {}
  this.setDirty(true)
}

LGraphCanvas.prototype.centerOnNode = function (node) {
  this.offset[0] = -node.pos[0] - node.size[0] * 0.5 + (this.canvas.width * 0.5 / this.scale)
  this.offset[1] = -node.pos[1] - node.size[1] * 0.5 + (this.canvas.height * 0.5 / this.scale)
  this.setDirty(true, true)
}

LGraphCanvas.prototype.adjustMouseEvent = function (e) {
  var b = this.canvas.getBoundingClientRect()
  e.localX = e.pageX - b.left
  e.localY = e.pageY - b.top

  e.canvasX = e.localX / this.scale - this.offset[0]
  e.canvasY = e.localY / this.scale - this.offset[1]
}

LGraphCanvas.prototype.setZoom = function (value, zooming_center) {
  if (!zooming_center) { zooming_center = [this.canvas.width * 0.5, this.canvas.height * 0.5] }

  var center = this.convertOffsetToCanvas(zooming_center)

  this.scale = value

  if (this.scale > this.max_zoom) { this.scale = this.max_zoom } else if (this.scale < this.min_zoom) { this.scale = this.min_zoom }

  var new_center = this.convertOffsetToCanvas(zooming_center)
  var delta_offset = [new_center[0] - center[0], new_center[1] - center[1]]

  this.offset[0] += delta_offset[0]
  this.offset[1] += delta_offset[1]

  this.dirty_canvas = true
  this.dirty_bgcanvas = true
}

LGraphCanvas.prototype.convertOffsetToCanvas = function (pos) {
  return [pos[0] / this.scale - this.offset[0], pos[1] / this.scale - this.offset[1]]
}

LGraphCanvas.prototype.convertCanvasToOffset = function (pos) {
  return [(pos[0] + this.offset[0]) * this.scale,
    (pos[1] + this.offset[1]) * this.scale ]
}

LGraphCanvas.prototype.convertEventToCanvas = function (e) {
  var rect = this.canvas.getClientRects()[0]
  return this.convertOffsetToCanvas([e.pageX - rect.left, e.pageY - rect.top])
}

LGraphCanvas.prototype.bringToFront = function (n) {
  var graph = this.getGraph()
  var i = graph._nodes.indexOf(n)
  if (i == -1) return

  graph._nodes.splice(i, 1)
  graph._nodes.push(n)
}

LGraphCanvas.prototype.sendToBack = function (n) {
  var graph = this.getGraph()
  var i = graph._nodes.indexOf(n)
  if (i === -1) return

  graph._nodes.splice(i, 1)
  graph._nodes.unshift(n)
}

/* Interaction */

/* LGraphCanvas render */

LGraphCanvas.prototype.computeVisibleNodes = function () {
  var graph = this.getGraph()
  var visible_nodes = []
  for (var i = 0, l = graph._nodes.length; i < l; ++i) {
    var n = graph._nodes[i]

// skip rendering nodes in live mode
    if (this.live_mode && !n.onDrawBackground && !n.onDrawForeground) { continue }

    if (!overlapBounding(this.visible_area, n.getBounding())) { continue } // out of the visible area

    visible_nodes.push(n)
  }
  return visible_nodes
}

LGraphCanvas.prototype.draw = function (force_canvas, force_bgcanvas) {
  if (!this.canvas) { return }

// fps counting
  var now = getTime()
  this.render_time = (now - this.last_draw_time) * 0.001
  this.last_draw_time = now
  var graph = this.getGraph()
  if (graph) {
    var start = [-this.offset[0], -this.offset[1] ]
    var end = [start[0] + this.canvas.width / this.scale, start[1] + this.canvas.height / this.scale]
    this.visible_area = new Float32Array([start[0], start[1], end[0], end[1]])
  }

  if (this.dirty_bgcanvas || force_bgcanvas || this.always_render_background || (graph && graph._last_trigger_time && (now - graph._last_trigger_time) < 1000)) { this.drawBackCanvas() }

  if (this.dirty_canvas || force_canvas) { this.drawFrontCanvas() }

  this.fps = this.render_time ? (1.0 / this.render_time) : 0
  this.frame += 1
}

LGraphCanvas.prototype.drawFrontCanvas = function () {
  var graph = this.getGraph()
  if (!this.ctx) { this.ctx = this.bgcanvas.getContext('2d') }
  var ctx = this.ctx
  if (!ctx) { return } // maybe is using webgl...

  if (ctx.start2D) { ctx.start2D() }

  var canvas = this.canvas

// reset in case of error
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

// clip dirty area if there is one, otherwise work in full canvas
  if (this.dirty_area) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(this.dirty_area[0], this.dirty_area[1], this.dirty_area[2], this.dirty_area[3])
    ctx.clip()
  }

// clear
// canvas.width = canvas.width;
  if (this.clear_background) { ctx.clearRect(0, 0, canvas.width, canvas.height) }

// draw bg canvas
  if (this.bgcanvas === this.canvas) { this.drawBackCanvas() } else { ctx.drawImage(this.bgcanvas, 0, 0) }

// rendering
  if (this.onRender) { this.onRender(canvas, ctx) }

// info widget
  if (this.show_info) { this.renderInfo(ctx) }

  if (graph) {
// apply transformations
    ctx.save()
    ctx.scale(this.scale, this.scale)
    ctx.translate(this.offset[0], this.offset[1])

// draw nodes
    var drawn_nodes = 0
    var visible_nodes = this.computeVisibleNodes()
    this.visible_nodes = visible_nodes

    for (var i = 0; i < visible_nodes.length; ++i) {
      var node = visible_nodes[i]

// transform coords system
      ctx.save()
      ctx.translate(node.pos[0], node.pos[1])

// Draw
      this.drawNode(node, ctx)
      drawn_nodes += 1

// Restore
      ctx.restore()
    }

// connections ontop?
    if (graph.config.links_ontop) {
      if (!this.live_mode) { this.drawConnections(ctx) }
    }

// current connection
    if (this.connecting_pos != null) {
      ctx.lineWidth = this.connections_width
      var linkColor = null
      switch (this.connecting_output.type) {
        case CONSTANTS.EVENT: linkColor = '#F85'; break
        default:
          linkColor = '#AFA'
      }
// the connection being dragged by the mouse
      this.renderLink(ctx, this.connecting_pos, [this.canvas_mouse[0], this.canvas_mouse[1]], null, false, null, linkColor)

      ctx.beginPath()
      if (this.connecting_output.type === CONSTANTS.EVENT) { ctx.rect((this.connecting_pos[0] - 6) + 0.5, (this.connecting_pos[1] - 5) + 0.5, 14, 10) } else { ctx.arc(this.connecting_pos[0], this.connecting_pos[1], 4, 0, Math.PI * 2) }
      ctx.fill()

      ctx.fillStyle = '#ffcc00'
      if (this._highlight_input) {
        ctx.beginPath()
        ctx.arc(this._highlight_input[0], this._highlight_input[1], 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  if (this.dirty_area) {
    ctx.restore()
// this.dirty_area = null;
  }

  if (ctx.finish2D) // this is a function I use in webgl renderer
{ ctx.finish2D() }

  this.dirty_canvas = false
}

LGraphCanvas.prototype.renderInfo = function (ctx, x, y) {
  x = x || 0
  y = y || 0

  ctx.save()
  ctx.translate(x, y)

  ctx.font = '10px Arial'
  ctx.fillStyle = '#888'
  var graph = this.getGraph()
  if (graph) {
    ctx.fillText('T: ' + graph.globaltime.toFixed(2) + 's', 5, 13 * 1)
    ctx.fillText('I: ' + graph.iteration, 5, 13 * 2)
    ctx.fillText('F: ' + this.frame, 5, 13 * 3)
    ctx.fillText('FPS:' + this.fps.toFixed(2), 5, 13 * 4)
  } else { ctx.fillText('No graph selected', 5, 13 * 1) }
  ctx.restore()
}

LGraphCanvas.prototype.drawBackCanvas = function () {
  var graph = this.getGraph()
  var canvas = this.bgcanvas
  if (canvas.width != this.canvas.width ||
canvas.height != this.canvas.height) {
    canvas.width = this.canvas.width
    canvas.height = this.canvas.height
  }

  if (!this.bgctx) { this.bgctx = this.bgcanvas.getContext('2d') }
  var ctx = this.bgctx
  if (ctx.start) { ctx.start() }

// clear
  if (this.clear_background) { ctx.clearRect(0, 0, canvas.width, canvas.height) }

// reset in case of error
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  if (graph) {
// apply transformations
    ctx.save()
    ctx.scale(this.scale, this.scale)
    ctx.translate(this.offset[0], this.offset[1])

// render BG
    if (this.background_image && this.scale > 0.5) {
      ctx.globalAlpha = (1.0 - 0.5 / this.scale) * this.editor_alpha
      ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = ctx.imageSmoothingEnabled = false
      if (!this._bg_img || this._bg_img.name != this.background_image) {
        this._bg_img = new Image()
        this._bg_img.name = this.background_image
        this._bg_img.src = this.background_image
        var that = this
        this._bg_img.onload = function () {
          that.draw(true, true)
        }
      }

      var pattern = null
      if (this._pattern == null && this._bg_img.width > 0) {
        pattern = ctx.createPattern(this._bg_img, 'repeat')
        this._pattern_img = this._bg_img
        this._pattern = pattern
      } else { pattern = this._pattern }
      if (pattern) {
        ctx.fillStyle = pattern
        ctx.fillRect(this.visible_area[0], this.visible_area[1], this.visible_area[2] - this.visible_area[0], this.visible_area[3] - this.visible_area[1])
        ctx.fillStyle = 'transparent'
      }

      ctx.globalAlpha = 1.0
      ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = ctx.imageSmoothingEnabled = true
    }

    if (this.onBackgroundRender) { this.onBackgroundRender(canvas, ctx) }

// DEBUG: show clipping area
// ctx.fillStyle = "red";
// ctx.fillRect( this.visible_area[0] + 10, this.visible_area[1] + 10, this.visible_area[2] - this.visible_area[0] - 20, this.visible_area[3] - this.visible_area[1] - 20);

// bg
    ctx.strokeStyle = '#235'
    ctx.strokeRect(0, 0, canvas.width, canvas.height)

    if (this.render_connections_shadows) {
      ctx.shadowColor = '#000'
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
      ctx.shadowBlur = 6
    } else { ctx.shadowColor = 'rgba(0,0,0,0)' }

// draw connections
    if (!this.live_mode) { this.drawConnections(ctx) }

    ctx.shadowColor = 'rgba(0,0,0,0)'

// restore state
    ctx.restore()
  }

  if (ctx.finish) { ctx.finish() }

  this.dirty_bgcanvas = false
  this.dirty_canvas = true // to force to repaint the front canvas with the bgcanvas
}

/* Renders the LGraphNode on the canvas */
LGraphCanvas.prototype.drawNode = function (node, ctx) {
  var glow = false

  var color = node.color || CONSTANTS.NODE_DEFAULT_COLOR
// if (this.selected) color = "#88F";

  var render_title = true
  if (node.flags.skip_title_render || node.graph.isLive()) { render_title = false }
  if (node.mouseOver) { render_title = true }

// shadow and glow
  if (node.mouseOver) glow = true

  if (node.selected) {
/*
ctx.shadowColor = "#EEEEFF";//glow ? "#AAF" : "#000";
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 0;
ctx.shadowBlur = 1;
*/
  } else if (this.render_shadows) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    ctx.shadowBlur = 3
  } else { ctx.shadowColor = 'transparent' }

// only render if it forces it to do it
  if (this.live_mode) {
    if (!node.flags.collapsed) {
      ctx.shadowColor = 'transparent'
// if(node.onDrawBackground)
// node.onDrawBackground(ctx);
      if (node.onDrawForeground) { node.onDrawForeground(ctx) }
    }

    return
  }

// draw in collapsed form
/*
if(node.flags.collapsed)
{
if(!node.onDrawCollapsed || node.onDrawCollapsed(ctx) == false)
this.drawNodeCollapsed(node, ctx, color, node.bgcolor);
return;
}
*/

  var editor_alpha = this.editor_alpha
  ctx.globalAlpha = editor_alpha

// clip if required (mask)
  var shape = node.shape || 'box'
  var size = new Float32Array(node.size)
  if (node.flags.collapsed) {
    size[0] = CONSTANTS.NODE_COLLAPSED_WIDTH
    size[1] = 0
  }

// Start clipping
  if (node.flags.clip_area) {
    ctx.save()
    if (shape == 'box') {
      ctx.beginPath()
      ctx.rect(0, 0, size[0], size[1])
    } else if (shape == 'round') {
      ctx.roundRect(0, 0, size[0], size[1], 10)
    } else if (shape == 'circle') {
      ctx.beginPath()
      ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5, 0, Math.PI * 2)
    }
    ctx.clip()
  }

// draw shape
  this.drawNodeShape(node, ctx, size, color, node.bgcolor, !render_title, node.selected)
  ctx.shadowColor = 'transparent'

// connection slots
  ctx.textAlign = 'left'
  ctx.font = this.inner_text_font

  var render_text = this.scale > 0.6

  var out_slot = this.connecting_output

// render inputs and outputs
  if (!node.flags.collapsed) {
// input connection slots
    if (node.inputs) {
      for (var i = 0; i < node.inputs.length; i++) {
        var slot = node.inputs[i]

        ctx.globalAlpha = editor_alpha
// change opacity of incompatible slots
        if (this.connecting_node && isValidConnection(slot.type && out_slot.type)) { ctx.globalAlpha = 0.4 * editor_alpha }

        ctx.fillStyle = slot.link != null ? '#7F7' : '#AAA'

        var pos = node.getConnectionPos(true, i)
        pos[0] -= node.pos[0]
        pos[1] -= node.pos[1]

        ctx.beginPath()

        if (slot.type === CONSTANTS.EVENT) { ctx.rect((pos[0] - 6) + 0.5, (pos[1] - 5) + 0.5, 14, 10) } else { ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2) }

        ctx.fill()

// render name
        if (render_text) {
          var text = slot.label != null ? slot.label : slot.name
          if (text) {
            ctx.fillStyle = color
            ctx.fillText(text, pos[0] + 10, pos[1] + 5)
          }
        }
      }
    }

// output connection slots
    if (this.connecting_node) { ctx.globalAlpha = 0.4 * editor_alpha }

    ctx.lineWidth = 1

    ctx.textAlign = 'right'
    ctx.strokeStyle = 'black'
    if (node.outputs) {
      for (var i = 0; i < node.outputs.length; i++) {
        var slot = node.outputs[i]

        var pos = node.getConnectionPos(false, i)
        pos[0] -= node.pos[0]
        pos[1] -= node.pos[1]

        ctx.fillStyle = slot.links && slot.links.length ? '#7F7' : '#AAA'
        ctx.beginPath()
// ctx.rect( node.size[0] - 14,i*14,10,10);

        if (slot.type === CONSTANTS.EVENT) { ctx.rect((pos[0] - 6) + 0.5, (pos[1] - 5) + 0.5, 14, 10) } else { ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2) }

// trigger
// if(slot.node_id != null && slot.slot == -1)
// ctx.fillStyle = "#F85";

// if(slot.links != null && slot.links.length)
        ctx.fill()
        ctx.stroke()

// render output name
        if (render_text) {
          var text = slot.label != null ? slot.label : slot.name
          if (text) {
            ctx.fillStyle = color
            ctx.fillText(text, pos[0] - 10, pos[1] + 5)
          }
        }
      }
    }

    ctx.textAlign = 'left'
    ctx.globalAlpha = 1

    if (node.onDrawForeground) { node.onDrawForeground(ctx) }
  }//! collapsed

  if (node.flags.clip_area) { ctx.restore() }

  ctx.globalAlpha = 1.0
}

/* Renders the node shape */
LGraphCanvas.prototype.drawNodeShape = function (node, ctx, size, fgcolor, bgcolor, noTitle, selected) {
// bg rect
  ctx.strokeStyle = fgcolor || CONSTANTS.NODE_DEFAULT_COLOR
  ctx.fillStyle = bgcolor || CONSTANTS.NODE_DEFAULT_BGCOLOR

  var titleHeight = CONSTANTS.NODE_TITLE_HEIGHT

// render depending on shape
  var shape = node.shape || 'box'
  if (shape === 'box') {
    ctx.beginPath()
    ctx.rect(0, noTitle ? 0 : -titleHeight, size[0] + 1, noTitle ? size[1] : size[1] + titleHeight)
    ctx.fill()
    ctx.shadowColor = 'transparent'

    if (selected) {
      ctx.strokeStyle = '#CCC'
      ctx.strokeRect(-0.5, noTitle ? -0.5 : -titleHeight + -0.5, size[0] + 2, noTitle ? (size[1] + 2) : (size[1] + titleHeight + 2) - 1)
      ctx.strokeStyle = fgcolor
    }
  } else if (node.shape === 'round') {
    ctx.roundRect(0, noTitle ? 0 : -titleHeight, size[0], noTitle ? size[1] : size[1] + titleHeight, 10)
    ctx.fill()
  } else if (node.shape === 'circle') {
    ctx.beginPath()
    ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.shadowColor = 'transparent'

// ctx.stroke();

// image
  if (node.bgImage && node.bgImage.width) { ctx.drawImage(node.bgImage, (size[0] - node.bgImage.width) * 0.5, (size[1] - node.bgImage.height) * 0.5) }

  if (node.bgImageUrl && !node.bgImage) { node.bgImage = node.loadImage(node.bgImageUrl) }

  if (node.onDrawBackground) { node.onDrawBackground(ctx) }

// title bg (remember, it is rendered ABOVE the node
  if (!noTitle) {
    ctx.fillStyle = fgcolor || CONSTANTS.NODE_DEFAULT_COLOR
    var oldAlpha = ctx.globalAlpha
    ctx.globalAlpha = 0.5 * oldAlpha
    if (shape === 'box') {
      ctx.beginPath()
      ctx.rect(0, -titleHeight, size[0] + 1, titleHeight)
      ctx.fill()
// ctx.stroke();
    } else if (shape === 'round') {
      ctx.roundRect(0, -titleHeight, size[0], titleHeight, 10, 0)
// ctx.fillRect(0,8,size[0],NODE_TITLE_HEIGHT - 12);
      ctx.fill()
// ctx.stroke();
    }

// title box
    ctx.fillStyle = node.boxcolor || CONSTANTS.NODE_DEFAULT_BOXCOLOR
    ctx.beginPath()
    if (shape === 'round') { ctx.arc(titleHeight * 0.5, titleHeight * -0.5, (titleHeight - 6) * 0.5, 0, Math.PI * 2) } else { ctx.rect(3, -titleHeight + 3, titleHeight - 6, titleHeight - 6) }
    ctx.fill()
    ctx.globalAlpha = oldAlpha

// title text
    ctx.font = this.title_text_font
    var title = node.getTitle()
    if (title && this.scale > 0.5) {
      ctx.fillStyle = CONSTANTS.NODE_TITLE_COLOR
      ctx.fillText(title, 16, 13 - titleHeight)
    }
  }
}

/* Renders the node when collapsed */
LGraphCanvas.prototype.drawNodeCollapsed = function (node, ctx, fgcolor, bgcolor) {
// draw default collapsed shape
  ctx.strokeStyle = fgcolor || CONSTANTS.NODE_DEFAULT_COLOR
  ctx.fillStyle = bgcolor || CONSTANTS.NODE_DEFAULT_BGCOLOR

  var collapsedRadius = CONSTANTS.NODE_COLLAPSED_RADIUS

// circle shape
  var shape = node.shape || 'box'
  if (shape === 'circle') {
    ctx.beginPath()
    ctx.arc(node.size[0] * 0.5, node.size[1] * 0.5, collapsedRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.stroke()

    ctx.fillStyle = node.boxcolor || CONSTANTS.NODE_DEFAULT_BOXCOLOR
    ctx.beginPath()
    ctx.arc(node.size[0] * 0.5, node.size[1] * 0.5, collapsedRadius * 0.5, 0, Math.PI * 2)
    ctx.fill()
  } else if (shape === 'round') { // rounded box
    ctx.beginPath()
    ctx.roundRect(node.size[0] * 0.5 - collapsedRadius, node.size[1] * 0.5 - collapsedRadius, 2 * collapsedRadius, 2 * collapsedRadius, 5)
    ctx.fill()
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.stroke()

    ctx.fillStyle = node.boxcolor || CONSTANTS.NODE_DEFAULT_BOXCOLOR
    ctx.beginPath()
    ctx.roundRect(node.size[0] * 0.5 - collapsedRadius * 0.5, node.size[1] * 0.5 - collapsedRadius * 0.5, collapsedRadius, collapsedRadius, 2)
    ctx.fill()
  } else { // flat box
    ctx.beginPath()
// ctx.rect(node.size[0] * 0.5 - collapsed_radius, node.size[1] * 0.5 - collapsed_radius, 2*collapsed_radius, 2*collapsed_radius);
    ctx.rect(0, 0, node.size[0], collapsedRadius * 2)
    ctx.fill()
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.stroke()

    ctx.fillStyle = node.boxcolor || CONSTANTS.NODE_DEFAULT_BOXCOLOR
    ctx.beginPath()
// ctx.rect(node.size[0] * 0.5 - collapsed_radius*0.5, node.size[1] * 0.5 - collapsed_radius*0.5, collapsed_radius,collapsed_radius);
    ctx.rect(collapsedRadius * 0.5, collapsedRadius * 0.5, collapsedRadius, collapsedRadius)
    ctx.fill()
  }
}

// OPTIMIZE THIS: precatch connections position instead of recomputing them every time
LGraphCanvas.prototype.drawConnections = function (ctx) {
  var graph = this.getGraph()
  var now = getTime()

// draw connections
  ctx.lineWidth = this.connections_width

  ctx.fillStyle = '#AAA'
  ctx.strokeStyle = '#AAA'
  ctx.globalAlpha = this.editor_alpha
// for every node
  for (var n = 0, l = graph._nodes.length; n < l; ++n) {
    var node = graph._nodes[n]
// for every input (we render just inputs because it is easier as every slot can only have one input)
    if (node.inputs && node.inputs.length) {
      for (var i = 0; i < node.inputs.length; ++i) {
        var input = node.inputs[i]
        if (!input || input.link == null) { continue }
        var linkId = input.link
        var link = graph.links[ linkId ]
        if (!link) { continue }

        var startNode = graph.getNodeById(link.origin_id)
        if (startNode == null) continue
        var startNodeSlot = link.origin_slot
        var startNodeSlotpos = null

        if (startNodeSlot === -1) { startNodeSlotpos = [startNode.pos[0] + 10, startNode.pos[1] + 10] } else { startNodeSlotpos = startNode.getConnectionPos(false, startNodeSlot) }

        this.renderLink(ctx, startNodeSlotpos, node.getConnectionPos(true, i), link)

// event triggered rendered on top
        if (link && link._last_time && (now - link._last_time) < 1000) {
          var f = 2.0 - (now - link._last_time) * 0.002
          var color = 'rgba(255,255,255, ' + f.toFixed(2) + ')'
          this.renderLink(ctx, startNodeSlotpos, node.getConnectionPos(true, i), link, true, f, color)
        }
      }
    }
  }
  ctx.globalAlpha = 1
}

LGraphCanvas.prototype.renderLink = function (ctx, a, b, link, skipBorder, flow, color) {
  if (!this.highquality_render) {
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
    return
  }

  var dist = distance(a, b)

  if (this.render_connections_border && this.scale > 0.6) { ctx.lineWidth = this.connections_width + 4 }

// choose color
  if (!color && link) { color = LGraphCanvas.link_type_colors[ link.type ] }
  if (!color) { color = this.default_link_color }

// begin line shape
  ctx.beginPath()

  if (this.render_curved_connections) { // splines
    ctx.moveTo(a[0], a[1])
    ctx.bezierCurveTo(a[0] + dist * 0.25, a[1],
        b[0] - dist * 0.25, b[1],
        b[0], b[1])
  } else {   // lines
    ctx.moveTo(a[0] + 10, a[1])
    ctx.lineTo(((a[0] + 10) + (b[0] - 10)) * 0.5, a[1])
    ctx.lineTo(((a[0] + 10) + (b[0] - 10)) * 0.5, b[1])
    ctx.lineTo(b[0] - 10, b[1])
  }

// rendering the outline of the connection can be a little bit slow
  if (this.render_connections_border && this.scale > 0.6 && !skipBorder) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.stroke()
  }

  ctx.lineWidth = this.connections_width
  ctx.fillStyle = ctx.strokeStyle = color
  ctx.stroke()
// end line shape

// render arrow in the middle
  if (this.render_connection_arrows && this.scale >= 0.6) {
// render arrow
    if (this.render_connection_arrows && this.scale > 0.6) {
// compute two points in the connection
      var pos = this.computeConnectionPoint(a, b, 0.5)
      var pos2 = this.computeConnectionPoint(a, b, 0.51)

// compute the angle between them so the arrow points in the right direction
      var angle = 0
      if (this.render_curved_connections) { angle = -Math.atan2(pos2[0] - pos[0], pos2[1] - pos[1]) } else { angle = b[1] > a[1] ? 0 : Math.PI }

// render arrow
      ctx.save()
      ctx.translate(pos[0], pos[1])
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(-5, -5)
      ctx.lineTo(0, +5)
      ctx.lineTo(+5, -5)
      ctx.fill()
      ctx.restore()
    }
  }

// render flowing points
  if (flow) {
    for (var i = 0; i < 5; ++i) {
      var f = (getTime() * 0.001 + (i * 0.2)) % 1
      var pos = this.computeConnectionPoint(a, b, f)
      ctx.beginPath()
      ctx.arc(pos[0], pos[1], 5, 0, 2 * Math.PI)
      ctx.fill()
    }
  }
}

LGraphCanvas.prototype.computeConnectionPoint = function (a, b, t) {
  var dist = distance(a, b)
  var p0 = a
  var p1 = [ a[0] + dist * 0.25, a[1] ]
  var p2 = [ b[0] - dist * 0.25, b[1] ]
  var p3 = b

  var c1 = (1 - t) * (1 - t) * (1 - t)
  var c2 = 3 * ((1 - t) * (1 - t)) * t
  var c3 = 3 * (1 - t) * (t * t)
  var c4 = t * t * t

  var x = c1 * p0[0] + c2 * p1[0] + c3 * p2[0] + c4 * p3[0]
  var y = c1 * p0[1] + c2 * p1[1] + c3 * p2[1] + c4 * p3[1]
  return [x, y]
}

/*
LGraphCanvas.prototype.resizeCanvas = function(width,height)
{
this.canvas.width = width;
if(height)
this.canvas.height = height;

this.bgcanvas.width = this.canvas.width;
this.bgcanvas.height = this.canvas.height;
this.draw(true,true);
}
*/

LGraphCanvas.prototype.resize = function (width, height) {
  if (!width && !height) {
    var parent = this.canvas.parentNode
    width = parent.offsetWidth
    height = parent.offsetHeight
  }

  if (this.canvas.width === width && this.canvas.height === height) { return }

  this.canvas.width = width
  this.canvas.height = height
  this.bgcanvas.width = this.canvas.width
  this.bgcanvas.height = this.canvas.height
  this.setDirty(true, true)
}

LGraphCanvas.prototype.switchLiveMode = function (transition) {
  if (!transition) {
    this.live_mode = !this.live_mode
    this.dirty_canvas = true
    this.dirty_bgcanvas = true
    return
  }

  var self = this
  var delta = this.live_mode ? 1.1 : 0.9
  if (this.live_mode) {
    this.live_mode = false
    this.editor_alpha = 0.1
  }

  var t = setInterval(function () {
    self.editor_alpha *= delta
    self.dirty_canvas = true
    self.dirty_bgcanvas = true

    if (delta < 1 && self.editor_alpha < 0.01) {
      clearInterval(t)
      if (delta < 1) { self.live_mode = true }
    }
    if (delta > 1 && self.editor_alpha > 0.99) {
      clearInterval(t)
      self.editor_alpha = 1
    }
  }, 1)
}

LGraphCanvas.prototype.onNodeSelectionChange = function (node) {
// disabled
// if(this.node_in_panel) this.showNodePanel(node);
}

LGraphCanvas.prototype.touchHandler = function (event) {
// alert("foo");
  var touches = event.changedTouches
  var first = touches[0]
  var type = ''

  switch (event.type) {
    case 'touchstart': type = 'mousedown'; break
    case 'touchmove': type = 'mousemove'; break
    case 'touchend': type = 'mouseup'; break
    default: return
  }

           // initMouseEvent(type, canBubble, cancelable, view, clickCount,
  //           screenX, screenY, clientX, clientY, ctrlKey,
  //           altKey, shiftKey, metaKey, button, relatedTarget);

  var window = this.getCanvasWindow()
  var document = window.document

  var simulatedEvent = document.createEvent('MouseEvent')
  simulatedEvent.initMouseEvent(type, true, true, window, 1,
                            first.screenX, first.screenY,
                            first.clientX, first.clientY, false,
                            false, false, false, 0/* left */, null)
  first.target.dispatchEvent(simulatedEvent)
  event.preventDefault()
}

/* CONTEXT MENU ********************/

LGraphCanvas.onMenuAdd = function (node, options, e, prevMenu) {
  var canvas = LGraphCanvas.active_canvas
  var refWindow = canvas.getCanvasWindow()

  var values = getNodeTypesCategories()   //ToDo Connect to graph
  var entries = []
  for (var i in values) {
    if (values[i]) { entries.push({ value: values[i], content: values[i], has_submenu: true }) }
  }

  var menu = new ContextMenu(entries, { event: e, callback: inner_clicked, parentMenu: prevMenu }, refWindow)

  function inner_clicked (v, option, e) {
    var category = v.value
    var node_types = getNodeTypesInCategory(category)   //ToDo: Connect to graph
    var values = []
    for (var i in node_types) { values.push({ content: node_types[i].title, value: node_types[i].type }) }

    var innerMenu = new ContextMenu(values, {event: e, callback: inner_create, parentMenu: menu }, refWindow)
    return false
  }

  function inner_create (v, e) {
    var first_event = prevMenu.getFirstEvent()
    var node = createNode(v.value)              //ToDo: Connect to graph
    if (node) {
      node.pos = canvas.convertEventToCanvas(first_event)
      canvas.graph.add(node)
    }
  }

  return false
}

LGraphCanvas.onMenuCollapseAll = function () {

}

LGraphCanvas.onMenuNodeEdit = function () {

}

LGraphCanvas.showMenuNodeOptionalInputs = function (v, options_, e, prevMenu, node) {
  if (!node) { return }

  var that = this
  var canvas = LGraphCanvas.active_canvas
  var refWindow = canvas.getCanvasWindow()

  var options = node.optional_inputs
  if (node.onGetInputs) { options = node.onGetInputs() }

  var entries = []
  if (options) {
    for (var i in options) {
      var entry = options[i]
      if (!entry) {
        entries.push(null)
        continue
      }
      var label = entry[0]
      if (entry[2] && entry[2].label) { label = entry[2].label }
      entries.push({content: label, value: entry})
    }
  }

  if (this.onMenuNodeInputs) { entries = this.onMenuNodeInputs(entries) }

  if (!entries.length) { return }

  var menu = new ContextMenu(entries, { event: e, callback: inner_clicked, parentMenu: prevMenu, node: node }, refWindow)

  function inner_clicked (v, e, prev) {
    if (!node) { return }

    if (v.callback) { v.callback.call(that, node, v, e, prev) }

    if (v.value) { node.addInput(v.value[0], v.value[1], v.value[2]) }
  }

  return false
}

LGraphCanvas.showMenuNodeOptionalOutputs = function (v, options, e, prev_menu, node) {
  if (!node) { return }

  var that = this
  var canvas = LGraphCanvas.active_canvas
  var ref_window = canvas.getCanvasWindow()

  var options = node.optional_outputs
  if (node.onGetOutputs) { options = node.onGetOutputs() }

  var entries = []
  if (options) {
    for (var i in options) {
      var entry = options[i]
      if (!entry) // separator?
{
        entries.push(null)
        continue
      }

      if (node.findOutputSlot(entry[0]) != -1) { continue } // skip the ones already on
      var label = entry[0]
      if (entry[2] && entry[2].label) { label = entry[2].label }
      var data = {content: label, value: entry}
      if (entry[1] === CONSTANTS.EVENT) { data.className = 'event' }
      entries.push(data)
    }
  }

  if (this.onMenuNodeOutputs) { entries = this.onMenuNodeOutputs(entries) }

  if (!entries.length) { return }

  var menu = new ContextMenu(entries, {event: e, callback: inner_clicked, parentMenu: prev_menu, node: node }, ref_window)

  function inner_clicked (v, e, prev) {
    if (!node) { return }

    if (v.callback) { v.callback.call(that, node, v, e, prev) }

    if (!v.value) { return }

    var value = v.value[1]

    if (value && (value.constructor === Object || value.constructor === Array)) // submenu why?
{
      var entries = []
      for (var i in value) { entries.push({ content: i, value: value[i]}) }
      new ContextMenu(entries, { event: e, callback: inner_clicked, parentMenu: prev_menu, node: node })
      return false
    } else { node.addOutput(v.value[0], v.value[1], v.value[2]) }
  }

  return false
}

LGraphCanvas.onShowMenuNodeProperties = function (value, options, e, prev_menu, node) {
  if (!node || !node.properties) { return }

  var that = this
  var canvas = LGraphCanvas.active_canvas
  var ref_window = canvas.getCanvasWindow()

  var entries = []
  for (var i in node.properties) {
    var value = node.properties[i] !== undefined ? node.properties[i] : ' '
// value could contain invalid html characters, clean that
    value = LGraphCanvas.decodeHTML(value)
    entries.push({content: "<span class='property_name'>" + i + '</span>' + "<span class='property_value'>" + value + '</span>', value: i})
  }
  if (!entries.length) { return }

  var menu = new ContextMenu(entries, {event: e, callback: inner_clicked, parentMenu: prev_menu, allow_html: true, node: node }, ref_window)

  function inner_clicked (v, options, e, prev) {
    if (!node) { return }
    var rect = this.getBoundingClientRect()
    canvas.showEditPropertyValue(node, v.value, { position: [rect.left, rect.top] })
  }

  return false
}

LGraphCanvas.decodeHTML = function (str) {
  var e = document.createElement('div')
  e.innerText = str
  return e.innerHTML
}

LGraphCanvas.onResizeNode = function (value, options, e, menu, node) {
  if (!node) { return }
  node.size = node.computeSize()
  node.setDirtyCanvas(true, true)
}

LGraphCanvas.onShowTitleEditor = function (value, options, e, menu, node) {
  var input_html = ''

  var dialog = document.createElement('div')
  dialog.className = 'graphdialog'
  dialog.innerHTML = "<span class='name'>Title</span><input autofocus type='text' class='value'/><button>OK</button>"
  var input = dialog.querySelector('input')
  if (input) {
    input.value = node.title
    input.addEventListener('keydown', function (e) {
      if (e.keyCode != 13) { return }
      inner()
      e.preventDefault()
      e.stopPropagation()
    })
  }

  var graphcanvas = LGraphCanvas.active_canvas
  var canvas = graphcanvas.canvas

  var rect = canvas.getBoundingClientRect()
  var offsetx = -20
  var offsety = -20
  if (rect) {
    offsetx -= rect.left
    offsety -= rect.top
  }

  if (event) {
    dialog.style.left = (event.pageX + offsetx) + 'px'
    dialog.style.top = (event.pageY + offsety) + 'px'
  } else {
    dialog.style.left = (canvas.width * 0.5 + offsetx) + 'px'
    dialog.style.top = (canvas.height * 0.5 + offsety) + 'px'
  }

  var button = dialog.querySelector('button')
  button.addEventListener('click', inner)
  canvas.parentNode.appendChild(dialog)

  function inner () {
    setValue(input.value)
  }

  function setValue (value) {
    node.title = value
    dialog.parentNode.removeChild(dialog)
    node.setDirtyCanvas(true, true)
  }
}

LGraphCanvas.prototype.showEditPropertyValue = function (node, property, options) {
  if (!node || node.properties[ property ] === undefined) { return }

  options = options || {}
  var that = this

  var type = 'string'

  if (node.properties[ property ] !== null) { type = typeof (node.properties[ property ]) }

  var info = null
  if (node.getPropertyInfo) { info = node.getPropertyInfo(property) }
  if (node.properties_info) {
    for (var i = 0; i < node.properties_info.length; ++i) {
      if (node.properties_info[i].name == property) {
        info = node.properties_info[i]
        break
      }
    }
  }

  if (info !== undefined && info !== null && info.type) { type = info.type }

  var input_html = ''

  if (type == 'string' || type == 'number') { input_html = "<input autofocus type='text' class='value'/>" } else if (type == 'enum' && info.values) {
    input_html = "<select autofocus type='text' class='value'>"
    for (var i in info.values) {
      var v = info.values.constructor === Array ? info.values[i] : i
      input_html += "<option value='" + v + "' " + (v == node.properties[property] ? 'selected' : '') + '>' + info.values[i] + '</option>'
    }
    input_html += '</select>'
  } else if (type == 'boolean') {
    input_html = "<input autofocus type='checkbox' class='value' " + (node.properties[property] ? 'checked' : '') + '/>'
  }

  var dialog = document.createElement('div')
  dialog.className = 'graphdialog'
  dialog.innerHTML = "<span class='name'>" + property + '</span>' + input_html + '<button>OK</button>'

  if (type == 'enum' && info.values) {
    var input = dialog.querySelector('select')
    input.addEventListener('change', function (e) {
      setValue(e.target.value)
// var index = e.target.value;
// setValue( e.options[e.selectedIndex].value );
    })
  } else if (type == 'boolean') {
    var input = dialog.querySelector('input')
    if (input) {
      input.addEventListener('click', function (e) {
        setValue(!!input.checked)
      })
    }
  } else {
    var input = dialog.querySelector('input')
    if (input) {
      input.value = node.properties[ property ] !== undefined ? node.properties[ property ] : ''
      input.addEventListener('keydown', function (e) {
        if (e.keyCode != 13) { return }
        inner()
        e.preventDefault()
        e.stopPropagation()
      })
    }
  }

  var rect = this.canvas.getClientRects()[0]
  var offsetx = -20
  var offsety = -20
  if (rect) {
    offsetx -= rect.left
    offsety -= rect.top
  }

  if (options.position) {
    offsetx += options.position[0]
    offsety += options.position[1]
  } else if (options.event) {
    offsetx += options.event.pageX
    offsety += options.event.pageY
  } else // centered
{
    offsetx += this.canvas.width * 0.5
    offsety += this.canvas.height * 0.5
  }

  dialog.style.left = offsetx + 'px'
  dialog.style.top = offsety + 'px'

  var button = dialog.querySelector('button')
  button.addEventListener('click', inner)

  this.canvas.parentNode.appendChild(dialog)

  function inner () {
    setValue(input.value)
  }

  function setValue (value) {
    if (typeof (node.properties[ property ]) === 'number') { value = Number(value) }
    node.properties[ property ] = value

    if (node.onPropertyChanged) { node.onPropertyChanged(property, value) }
    dialog.parentNode.removeChild(dialog)
    node.setDirtyCanvas(true, true)
  }
}

LGraphCanvas.onMenuNodeCollapse = function (value, options, e, menu, node) {
  node.flags.collapsed = !node.flags.collapsed
  node.setDirtyCanvas(true, true)
}

LGraphCanvas.onMenuNodePin = function (value, options, e, menu, node) {
  node.pin()
}

LGraphCanvas.onMenuNodeMode = function (value, options, e, menu, node) {
  var prevMenu    //??
  var menu = new ContextMenu(['Always', 'On Event', 'Never'], {event: e, callback: inner_clicked, parentMenu: prevMenu, node: node })

  function inner_clicked (v) {
    if (!node) { return }
    switch (v) {
      case 'On Event': node.mode = CONSTANTS.ON_EVENT; break
      case 'Never': node.mode = CONSTANTS.NEVER; break
      case 'Always':
      default:
        node.mode = CONSTANTS.ALWAYS; break
    }
  }

  return false
}

LGraphCanvas.onMenuNodeColors = function (value, options, e, menu, node) {
  if (!node) { throw new Error('no node for color') }

  var values = []
  for (var i in LGraphCanvas.node_colors) {
    var color = LGraphCanvas.node_colors[i]
    var value = {value: i, content: "<span style='display: block; color:" + color.color + '; background-color:' + color.bgcolor + "'>" + i + '</span>'}
    values.push(value)
  }

  var menu = new ContextMenu(values, { event: e, callback: inner_clicked, parentMenu: menu, node: node })

  function inner_clicked (v) {
    if (!node) { return }

    var color = LGraphCanvas.node_colors[ v.value ]
    if (color) {
      node.color = color.color
      node.bgcolor = color.bgcolor
      node.setDirtyCanvas(true)
    }
  }

  return false
}

LGraphCanvas.onMenuNodeShapes = function (value, options, e, menu, node) {
  if (!node) { throw new Error('no node passed') }

  var menu = new ContextMenu(['box', 'round'], { event: e, callback: inner_clicked, parentMenu: menu, node: node })

  function inner_clicked (v) {
    if (!node) { return }
    node.shape = v
    node.setDirtyCanvas(true)
  }

  return false
}

LGraphCanvas.onMenuNodeRemove = function (value, options, e, menu, node) {
  if (!node) { throw new Error('no node passed') }

  if (node.removable == false) { return }
  node.graph.remove(node)
  node.setDirtyCanvas(true, true)
}

LGraphCanvas.onMenuNodeClone = function (value, options, e, menu, node) {
  if (node.clonable == false) return
  var newnode = node.clone()
  if (!newnode) return
  newnode.pos = [node.pos[0] + 5, node.pos[1] + 5]
  node.graph.add(newnode)
  node.setDirtyCanvas(true, true)
}

LGraphCanvas.node_colors = {
  'red': { color: '#FAA', bgcolor: '#A44' },
  'green': { color: '#AFA', bgcolor: '#4A4' },
  'blue': { color: '#AAF', bgcolor: '#44A' },
  'white': { color: '#FFF', bgcolor: '#AAA' }
}

LGraphCanvas.prototype.getCanvasMenuOptions = function () {
  var options = null
  if (this.getMenuOptions) { options = this.getMenuOptions() } else {
    options = [
{ content: 'Add Node', has_submenu: true, callback: LGraphCanvas.onMenuAdd }
// {content:"Collapse All", callback: LGraphCanvas.onMenuCollapseAll }
    ]

    if (this.graphStack.length > 0) { options = [{content: 'Close subgraph', callback: this.closeSubgraph.bind(this) }, null].concat(options) }
  }

  if (this.getExtraMenuOptions) {
    var extra = this.getExtraMenuOptions(this, options)
    if (extra) { options = options.concat(extra) }
  }

  return options
}

// called by processContextMenu to extract the menu list
LGraphCanvas.prototype.getNodeMenuOptions = function (node) {
  var options = null

  if (node.getMenuOptions) { options = node.getMenuOptions(this) } else {
    options = [
    { content: 'Inputs', has_submenu: true, disabled: true, callback: LGraphCanvas.showMenuNodeOptionalInputs },
    { content: 'Outputs', has_submenu: true, disabled: true, callback: LGraphCanvas.showMenuNodeOptionalOutputs },
      null,
    { content: 'Properties', has_submenu: true, callback: LGraphCanvas.onShowMenuNodeProperties },
      null,
    { content: 'Title', callback: LGraphCanvas.onShowTitleEditor },
    { content: 'Mode', has_submenu: true, callback: LGraphCanvas.onMenuNodeMode },
    { content: 'Resize', callback: LGraphCanvas.onResizeNode },
    { content: 'Collapse', callback: LGraphCanvas.onMenuNodeCollapse },
    { content: 'Pin', callback: LGraphCanvas.onMenuNodePin },
    { content: 'Colors', has_submenu: true, callback: LGraphCanvas.onMenuNodeColors },
    { content: 'Shapes', has_submenu: true, callback: LGraphCanvas.onMenuNodeShapes },
      null
    ]
  }

  if (node.getExtraMenuOptions) {
    var extra = node.getExtraMenuOptions(this)
    if (extra) {
      extra.push(null)
      options = extra.concat(options)
    }
  }

  if (node.clonable !== false) { options.push({ content: 'Clone', callback: LGraphCanvas.onMenuNodeClone }) }
  if (node.removable !== false) { options.push(null, { content: 'Remove', callback: LGraphCanvas.onMenuNodeRemove }) }

  if (node.onGetInputs) {
    var inputs = node.onGetInputs()
    if (inputs && inputs.length) { options[0].disabled = false }
  }

  if (node.onGetOutputs) {
    var outputs = node.onGetOutputs()
    if (outputs && outputs.length) { options[1].disabled = false }
  }

  if (node.graph && node.graph.onGetNodeMenuOptions) { node.graph.onGetNodeMenuOptions(options, node) }

  return options
}

LGraphCanvas.prototype.processContextMenu = function (node, event) {
  var that = this
  var canvas = LGraphCanvas.active_canvas
  var ref_window = canvas.getCanvasWindow()

  var menu_info = null
  var options = { event: event, callback: inner_option_clicked, node: node }

// check if mouse is in input
  var slot = null
  if (node) {
    slot = node.getSlotInPosition(event.canvasX, event.canvasY)
    LGraphCanvas.active_node = node
  }

  if (slot) {
    menu_info = slot.locked ? [ 'Cannot remove' ] : { 'Remove Slot': slot }
    options.title = slot.input ? slot.input.type : slot.output.type
    if (slot.input && slot.input.type == EVENT) { options.title = 'Event' }
  } else { menu_info = node ? this.getNodeMenuOptions(node) : this.getCanvasMenuOptions() }

// show menu
  if (!menu_info) { return }

  var menu = new ContextMenu(menu_info, options, ref_window)

  function inner_option_clicked (v, options, e) {
    if (!v) { return }

    if (v == slot) {
      if (v.input) { node.removeInput(slot.slot) } else if (v.output) { node.removeOutput(slot.slot) }
    }

// if(v.callback)
// return v.callback.call(that, node, options, e, menu, that, event );
  }
}

function closeAllContextMenus (ref_window) {
  ref_window = ref_window || window

  var elements = ref_window.document.querySelectorAll('.litecontextmenu')
  if (!elements.length) { return }

  var result = []
  for (var i = 0; i < elements.length; i++) { result.push(elements[i]) }

  for (var i in result) {
    if (result[i].close) { result[i].close() } else if (result[i].parentNode) { result[i].parentNode.removeChild(result[i]) }
  }
}

export {
  LGraphCanvas
}
