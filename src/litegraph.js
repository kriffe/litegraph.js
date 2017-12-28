// *************************************************************
//   LiteGraph CLASS                                     *******
// *************************************************************

/* FYI: links are stored in graph.links with this structure per object
{
  id: number
  type: string,
  origin_id: number,
  origin_slot: number,
  target_id: number,
  target_slot: number,
  data: *
};
*/

import {LGraphCanvas} from './LGraphCanvas.js'
import {LGraphNode} from './LGraphNode.js'
import {getTime} from './MathHelpers.js'
import {CONSTANTS} from './Constants.js'

/**
* The Global Scope. It contains all the registered node classes.
*
* @class LiteGraph
* @constructor
*/


const proxy = null // used to redirect calls

const debug = false
const throw_errors = true
const allow_scripts = true
const registered_node_types = {} // nodetypes by string
const node_types_by_file_extension = {} // used for droping files in the canvas
const Nodes = {} // node types by classname

/**
* Register a node class so it can be listed when the user wants to create a new one
* @method registerNodeType
* @param {String} type name of the node and path
* @param {Class} base_class class containing the structure of a node
*/

var registerNodeType = function (type, baseClass) {
  if (!baseClass.prototype) { throw new Error('Cannot register a simple object, it must be a class with a prototype') }
  baseClass.type = type

  if (debug) { console.log('Node registered: ' + type) }

  var categories = type.split('/')
  var classname = baseClass.constructor.name

  var pos = type.lastIndexOf('/')
  baseClass.category = type.substr(0, pos)

  if (!baseClass.title) { baseClass.title = classname }
// info.name = name.substr(pos+1,name.length - pos);

// extend class
  if (baseClass.prototype) // is a class
      {
    for (var i in LGraphNode.prototype) {
      if (!baseClass.prototype[i]) { baseClass.prototype[i] = LGraphNode.prototype[i] }
    }
  }

  registered_node_types[ type ] = baseClass
  if (baseClass.constructor.name) { Nodes[ classname ] = baseClass }

// warnings
  if (baseClass.prototype.onPropertyChange) { console.warn('LiteGraph node class ' + type + ' has onPropertyChange method, it must be called onPropertyChanged with d at the end') }

  if (baseClass.supported_extensions) {
    for (var i in baseClass.supported_extensions) { node_types_by_file_extension[ baseClass.supported_extensions[i].toLowerCase() ] = baseClass }
  }
}

/**
* Adds this method to all nodetypes, existing and to be created
* (You can add it to LGraphNode.prototype but then existing node types wont have it)
* @method addNodeMethod
* @param {Function} func
*/
var addNodeMethod = function (name, func) {
  LGraphNode.prototype[name] = func
  for (var i in registered_node_types) {
    var type = registered_node_types[i]
    if (type.prototype[name]) { type.prototype['_' + name] = type.prototype[name] } // keep old in case of replacing
    type.prototype[name] = func
  }
}
/**
* Create a node of a given type with a name. The node is not attached to any graph yet.
* @method createNode
* @param {String} type full name of the node class. p.e. "math/sin"
* @param {String} name a name to distinguish from other nodes
* @param {Object} options to set options
*/

var createNode = function (type, title, options) {
  var BaseClass = registered_node_types[type]
  if (!BaseClass) {
    if (debug) { console.log('GraphNode type "' + type + '" not registered.') }
    return null
  }

  var prototype = BaseClass.prototype || BaseClass

  title = title || BaseClass.title || type

  var node = new BaseClass(name)
  node.type = type

  if (!node.title) node.title = title
  if (!node.properties) node.properties = {}
  if (!node.properties_info) node.properties_info = []
  if (!node.flags) node.flags = {}
  if (!node.size) node.size = node.computeSize()
  if (!node.pos) node.pos = CONSTANTS.DEFAULT_POSITION.concat()
  if (!node.mode) node.mode = CONSTANTS.ALWAYS

// extra options
  if (options) {
    for (var i in options) { node[i] = options[i] }
  }

  return node
}

/**
* Returns a registered node type with a given name
* @method getNodeType
* @param {String} type full name of the node class. p.e. "math/sin"
* @return {Class} the node class
*/

var getNodeType = function (type) {
  return registered_node_types[type]
}

  /**
  * Returns a list of node types matching one category
  * @method getNodeType
  * @param {String} category category name
  * @return {Array} array with all the node classes
  */

var getNodeTypesInCategory = function (category) {
  var r = []
  for (var i in registered_node_types) {
    if (category == '') {
      if (registered_node_types[i].category == null) { r.push(registered_node_types[i]) }
    } else if (registered_node_types[i].category === category) { r.push(registered_node_types[i]) }
  }

  return r
}

/**
* Returns a list with all the node type categories
* @method getNodeTypesCategories
* @return {Array} array with all the names of the categories
*/

var getNodeTypesCategories = function () {
  var categories = {'': 1}
  for (var i in registered_node_types) {
    if (registered_node_types[i].category && !registered_node_types[i].skip_list) { categories[ registered_node_types[i].category ] = 1 }
  }
  var result = []
  for (var i in categories) { result.push(i) }
  return result
}

// debug purposes: reloads all the js scripts that matches a wilcard
var reloadNodes = function (folder_wildcard) {
  var tmp = document.getElementsByTagName('script')
// weird, this array changes by its own, so we use a copy
  var script_files = []
  for (var i in tmp) { script_files.push(tmp[i]) }

  var docHeadObj = document.getElementsByTagName('head')[0]
  folder_wildcard = document.location.href + folder_wildcard

  for (var i in script_files) {
    var src = script_files[i].src
    if (!src || src.substr(0, folder_wildcard.length) != folder_wildcard) { continue }

    try {
      if (debug) { console.log('Reloading: ' + src) }
      var dynamicScript = document.createElement('script')
      dynamicScript.type = 'text/javascript'
      dynamicScript.src = src
      docHeadObj.appendChild(dynamicScript)
      docHeadObj.removeChild(script_files[i])
    } catch (err) {
      if (throw_errors) { throw err }
      if (debug) { console.log('Error while reloading ' + src) }
    }
  }

  if (debug) { console.log('Nodes reloaded') }
}


// *************************************************************
//   Node CLASS                                          *******
// *************************************************************

/*
title: string
pos: [x,y]
size: [x,y]

input|output: every connection
+  { name:string, type:string, pos: [x,y]=Optional, direction: "input"|"output", links: Array });

flags:
+ skip_title_render
+ clip_area
+ unsafe_execution: not allowed for safe execution

supported callbacks:
+ onAdded: when added to graph
+ onRemoved: when removed from graph
+ onStart:when the graph starts playing
+ onStop:when the graph stops playing
+ onDrawForeground: render the inside widgets inside the node
+ onDrawBackground: render the background area inside the node (only in edit mode)
+ onMouseDown
+ onMouseMove
+ onMouseUp
+ onMouseEnter
+ onMouseLeave
+ onExecute: execute the node
+ onPropertyChanged: when a property is changed in the panel (return true to skip default behaviour)
+ onGetInputs: returns an array of possible inputs
+ onGetOutputs: returns an array of possible outputs
+ onDblClick
+ onSerialize
+ onSelected
+ onDeselected
+ onDropItem : DOM item dropped over the node
+ onDropFile : file dropped over the node
+ onConnectInput : if returns false the incoming connection will be canceled
+ onConnectionsChange : a connection changed (new one or removed) (LiteGraph.INPUT or LiteGraph.OUTPUT, slot, true if connected, link_info, input_info )
*/

//* ********************************************************************************
// LGraph CLASS
//* ********************************************************************************

/**
* LGraph is the class that contain a full graph. We instantiate one and add nodes to it, and then we can run the execution loop.
*
* @class LGraph
* @constructor
*/

function LGraph () {
  if (debug) { console.log('Graph created') }
  this.list_of_graphcanvas = null
  this.clear()
}

// default supported types
LGraph.supported_types = ['number', 'string', 'boolean']

// used to know which types of connections support this graph (some graphs do not allow certain types)
LGraph.prototype.getSupportedTypes = function () { return this.supported_types || LGraph.supported_types }



/**
* Removes all nodes from this graph
* @method clear
*/

LGraph.prototype.clear = function () {
  this.stop()
  this.status = CONSTANTS.STATUS_STOPPED
  this.last_node_id = 0

// nodes
  this._nodes = []
  this._nodes_by_id = {}
  this._nodes_in_order = null // nodes that are executable sorted in execution order
  this._nodes_executable = null // nodes that contain onExecute

// links
  this.last_link_id = 0
  this.links = {} // container with all the links

// iterations
  this.iteration = 0

  this.config = {
  }

// timing
  this.globaltime = 0
  this.runningtime = 0
  this.fixedtime = 0
  this.fixedtime_lapse = 0.01
  this.elapsed_time = 0.01
  this.starttime = 0

  this.catch_errors = true

// globals
  this.global_inputs = {}
  this.global_outputs = {}

// this.graph = {};
  this.debug = true

  this.change()

  this.sendActionToCanvas('clear')
}

/**
* Attach Canvas to this graph
* @method attachCanvas
* @param {GraphCanvas} graph_canvas
*/

LGraph.prototype.attachCanvas = function (graphcanvas) {
  if (graphcanvas.constructor !== LGraphCanvas) { throw new Error('attachCanvas expects a LGraphCanvas instance') }
  if (graphcanvas.graph && graphcanvas.graph !== this) { graphcanvas.graph.detachCanvas(graphcanvas) }

  graphcanvas.graph = this
  if (!this.list_of_graphcanvas) { this.list_of_graphcanvas = [] }
  this.list_of_graphcanvas.push(graphcanvas)
}

/**
* Detach Canvas from this graph
* @method detachCanvas
* @param {GraphCanvas} graph_canvas
*/

LGraph.prototype.detachCanvas = function (graphcanvas) {
  if (!this.list_of_graphcanvas) { return }

  var pos = this.list_of_graphcanvas.indexOf(graphcanvas)
  if (pos == -1) { return }
  graphcanvas.graph = null
  this.list_of_graphcanvas.splice(pos, 1)
}

/**
* Starts running this graph every interval milliseconds.
* @method start
* @param {number} interval amount of milliseconds between executions, default is 1
*/

LGraph.prototype.start = function (interval) {
  if (this.status === CONSTANTS.STATUS_RUNNING) { return }
  this.status = CONSTANTS.STATUS_RUNNING

  if (this.onPlayEvent) { this.onPlayEvent() }

  this.sendEventToAllNodes('onStart')

// launch
  this.starttime = getTime()
  interval = interval || 1
  var that = this

  this.execution_timer_id = setInterval(function () {
// execute
    that.runStep(1, !this.catch_errors)
  }, interval)
}

/**
* Stops the execution loop of the graph
* @method stop execution
*/

LGraph.prototype.stop = function () {
  if (this.status === CONSTANTS.STATUS_STOPPED) { return }

  this.status = CONSTANTS.STATUS_STOPPED

  if (this.onStopEvent) { this.onStopEvent() }

  if (this.execution_timer_id != null) { clearInterval(this.execution_timer_id) }
  this.execution_timer_id = null

  this.sendEventToAllNodes('onStop')
}

/**
* Run N steps (cycles) of the graph
* @method runStep
* @param {number} num number of steps to run, default is 1
*/

LGraph.prototype.runStep = function (num, doNotCatchErrors) {
  num = num || 1

  var start = getTime()
  this.globaltime = 0.001 * (start - this.starttime)

  var nodes = this._nodes_executable ? this._nodes_executable : this._nodes
  if (!nodes) { return }

  if (doNotCatchErrors) {
// iterations
    for (var i = 0; i < num; i++) {
      for (var j = 0, l = nodes.length; j < l; ++j) {
        var node = nodes[j]
        if (node.mode == CONSTANTS.ALWAYS && node.onExecute) { node.onExecute() }
      }

      this.fixedtime += this.fixedtime_lapse
      if (this.onExecuteStep) { this.onExecuteStep() }
    }

    if (this.onAfterExecute) { this.onAfterExecute() }
  } else {
    try {
// iterations
      for (var i = 0; i < num; i++) {
        for (var j = 0, l = nodes.length; j < l; ++j) {
          var node = nodes[j]
          if (node.mode == CONSTANTS.ALWAYS && node.onExecute) { node.onExecute() }
        }

        this.fixedtime += this.fixedtime_lapse
        if (this.onExecuteStep) { this.onExecuteStep() }
      }

      if (this.onAfterExecute) { this.onAfterExecute() }
      this.errors_in_execution = false
    } catch (err) {
      this.errors_in_execution = true
      if (throw_errors) { throw err }
      if (debug) { console.log('Error during execution: ' + err) }
      this.stop()
    }
  }

  var elapsed = getTime() - start
  if (elapsed == 0) { elapsed = 1 }
  this.elapsed_time = 0.001 * elapsed
  this.globaltime += 0.001 * elapsed
  this.iteration += 1
}

/**
* Updates the graph execution order according to relevance of the nodes (nodes with only outputs have more relevance than
* nodes with only inputs.
* @method updateExecutionOrder
*/
LGraph.prototype.updateExecutionOrder = function () {
  this._nodes_in_order = this.computeExecutionOrder(false)
  this._nodes_executable = []
  for (var i = 0; i < this._nodes_in_order.length; ++i) {
    if (this._nodes_in_order[i].onExecute) { this._nodes_executable.push(this._nodes_in_order[i]) }
  }
}

// This is more internal, it computes the order and returns it
LGraph.prototype.computeExecutionOrder = function (only_onExecute) {
  var L = []
  var S = []
  var M = {}
  var visited_links = {} // to avoid repeating links
  var remaining_links = {} // to a

// search for the nodes without inputs (starting nodes)
  for (var i = 0, l = this._nodes.length; i < l; ++i) {
    var n = this._nodes[i]
    if (only_onExecute && !n.onExecute) { continue }

    M[n.id] = n // add to pending nodes

    var num = 0 // num of input connections
    if (n.inputs) {
      for (var j = 0, l2 = n.inputs.length; j < l2; j++) {
        if (n.inputs[j] && n.inputs[j].link != null) { num += 1 }
      }
    }

    if (num == 0) // is a starting node
  { S.push(n) } else // num of input links
{ remaining_links[n.id] = num }
  }

  while (true) {
    if (S.length == 0) { break }

// get an starting node
    var n = S.shift()
    L.push(n) // add to ordered list
    delete M[n.id] // remove from the pending nodes

// for every output
    if (n.outputs) {
      for (var i = 0; i < n.outputs.length; i++) {
        var output = n.outputs[i]
// not connected
        if (output == null || output.links == null || output.links.length == 0) { continue }

// for every connection
        for (var j = 0; j < output.links.length; j++) {
          var link_id = output.links[j]
          var link = this.links[link_id]
          if (!link) continue

// already visited link (ignore it)
          if (visited_links[ link.id ]) { continue }

          var target_node = this.getNodeById(link.target_id)
          if (target_node == null) {
              visited_links[ link.id ] = true
              continue
            }

          visited_links[link.id] = true // mark as visited
          remaining_links[target_node.id] -= 1 // reduce the number of links remaining
          if (remaining_links[target_node.id] == 0) { S.push(target_node) } // if no more links, then add to Starters array
        }
      }
    }
  }

// the remaining ones (loops)
  for (var i in M) { L.push(M[i]) }

  if (L.length != this._nodes.length && debug) { console.warn('something went wrong, nodes missing') }

// save order number in the node
  for (var i = 0; i < L.length; ++i) { L[i].order = i }

  return L
}

/**
* Returns the amount of time the graph has been running in milliseconds
* @method getTime
* @return {number} number of milliseconds the graph has been running
*/

LGraph.prototype.getTime = function () {
  return this.globaltime
}

/**
* Returns the amount of time accumulated using the fixedtime_lapse var. This is used in context where the time increments should be constant
* @method getFixedTime
* @return {number} number of milliseconds the graph has been running
*/

LGraph.prototype.getFixedTime = function () {
  return this.fixedtime
}

/**
* Returns the amount of time it took to compute the latest iteration. Take into account that this number could be not correct
* if the nodes are using graphical actions
* @method getElapsedTime
* @return {number} number of milliseconds it took the last cycle
*/

LGraph.prototype.getElapsedTime = function () {
  return this.elapsed_time
}

/**
* Sends an event to all the nodes, useful to trigger stuff
* @method sendEventToAllNodes
* @param {String} eventname the name of the event (function to be called)
* @param {Array} params parameters in array format
*/

LGraph.prototype.sendEventToAllNodes = function (eventname, params, mode) {
  mode = mode || CONSTANTS.ALWAYS

  var nodes = this._nodes_in_order ? this._nodes_in_order : this._nodes
  if (!nodes) { return }

  for (var j = 0, l = nodes.length; j < l; ++j) {
    var node = nodes[j]
    if (node[eventname] && node.mode == mode) {
      if (params === undefined) { node[eventname]() } else if (params && params.constructor === Array) { node[eventname].apply(node, params) } else { node[eventname](params) }
    }
  }
}

LGraph.prototype.sendActionToCanvas = function (action, params) {
  if (!this.list_of_graphcanvas) { return }

  for (var i = 0; i < this.list_of_graphcanvas.length; ++i) {
    var c = this.list_of_graphcanvas[i]
    if (c[action]) { c[action].apply(c, params) }
  }
}

/**
* Adds a new node instasnce to this graph
* @method add
* @param {LGraphNode} node the instance of the node
*/

LGraph.prototype.add = function (node, skip_compute_order) {
  if (!node || (node.id != -1 && this._nodes_by_id[node.id] != null)) { return } // already added

  if (this._nodes.length >= CONSTANTS.MAX_NUMBER_OF_NODES) { throw ('LiteGraph: max number of nodes in a graph reached') }

// give him an id
  if (node.id == null || node.id == -1) { node.id = ++this.last_node_id } else if (this.last_node_id < node.id) { this.last_node_id = node.id }

  node.graph = this

  this._nodes.push(node)
  this._nodes_by_id[node.id] = node

/*
// rendering stuf...
if(node.bgImageUrl)
node.bgImage = node.loadImage(node.bgImageUrl);
*/

  if (node.onAdded) { node.onAdded(this) }

  if (this.config.align_to_grid) { node.alignToGrid() }

  if (!skip_compute_order) { this.updateExecutionOrder() }

  if (this.onNodeAdded) { this.onNodeAdded(node) }

  this.setDirtyCanvas(true)

  this.change()

  return node // to chain actions
}

/**
* Removes a node from the graph
* @method remove
* @param {LGraphNode} node the instance of the node
*/

LGraph.prototype.remove = function (node) {
  if (this._nodes_by_id[node.id] == null) { return } // not found

  if (node.ignore_remove) { return } // cannot be removed

// disconnect inputs
  if (node.inputs) {
    for (var i = 0; i < node.inputs.length; i++) {
      var slot = node.inputs[i]
      if (slot.link != null) { node.disconnectInput(i) }
    }
  }

// disconnect outputs
  if (node.outputs) {
    for (var i = 0; i < node.outputs.length; i++) {
      var slot = node.outputs[i]
      if (slot.links != null && slot.links.length) { node.disconnectOutput(i) }
    }
  }

// node.id = -1; //why?

// callback
  if (node.onRemoved) { node.onRemoved() }

  node.graph = null

// remove from canvas render
  if (this.list_of_graphcanvas) {
    for (var i = 0; i < this.list_of_graphcanvas.length; ++i) {
      var canvas = this.list_of_graphcanvas[i]
      if (canvas.selected_nodes[node.id]) { delete canvas.selected_nodes[node.id] }
      if (canvas.node_dragged == node) { canvas.node_dragged = null }
    }
  }

// remove from containers
  var pos = this._nodes.indexOf(node)
  if (pos != -1) { this._nodes.splice(pos, 1) }
  delete this._nodes_by_id[node.id]

  if (this.onNodeRemoved) { this.onNodeRemoved(node) }

  this.setDirtyCanvas(true, true)

  this.change()

  this.updateExecutionOrder()
}

/**
* Returns a node by its id.
* @method getNodeById
* @param {Number} id
*/

LGraph.prototype.getNodeById = function (id) {
  if (id == null) { return null }
  return this._nodes_by_id[ id ]
}

/**
* Returns a list of nodes that matches a class
* @method findNodesByClass
* @param {Class} classObject the class itself (not an string)
* @return {Array} a list with all the nodes of this type
*/

LGraph.prototype.findNodesByClass = function (classObject) {
  var r = []
  for (var i = 0, l = this._nodes.length; i < l; ++i) {
    if (this._nodes[i].constructor === classObject) { r.push(this._nodes[i]) }
  }
  return r
}

/**
* Returns a list of nodes that matches a type
* @method findNodesByType
* @param {String} type the name of the node type
* @return {Array} a list with all the nodes of this type
*/

LGraph.prototype.findNodesByType = function (type) {
  var type = type.toLowerCase()
  var r = []
  for (var i = 0, l = this._nodes.length; i < l; ++i) {
    if (this._nodes[i].type.toLowerCase() == type) { r.push(this._nodes[i]) }
  }
  return r
}

/**
* Returns a list of nodes that matches a name
* @method findNodesByName
* @param {String} name the name of the node to search
* @return {Array} a list with all the nodes with this name
*/

LGraph.prototype.findNodesByTitle = function (title) {
  var result = []
  for (var i = 0, l = this._nodes.length; i < l; ++i) {
    if (this._nodes[i].title == title) { result.push(this._nodes[i]) }
  }
  return result
}

/**
* Returns the top-most node in this position of the canvas
* @method getNodeOnPos
* @param {number} x the x coordinate in canvas space
* @param {number} y the y coordinate in canvas space
* @param {Array} nodes_list a list with all the nodes to search from, by default is all the nodes in the graph
* @return {Array} a list with all the nodes that intersect this coordinate
*/

LGraph.prototype.getNodeOnPos = function (x, y, nodes_list) {
  nodes_list = nodes_list || this._nodes
  for (var i = nodes_list.length - 1; i >= 0; i--) {
    var n = nodes_list[i]
    if (n.isPointInsideNode(x, y, 2)) { return n }
  }
  return null
}

// ********** GLOBALS *****************

// Tell this graph has a global input of this type
LGraph.prototype.addGlobalInput = function (name, type, value) {
  this.global_inputs[name] = { name: name, type: type, value: value }

  if (this.onGlobalInputAdded) { this.onGlobalInputAdded(name, type) }

  if (this.onGlobalsChange) { this.onGlobalsChange() }
}

// assign a data to the global input
LGraph.prototype.setGlobalInputData = function (name, data) {
  var input = this.global_inputs[name]
  if (!input) { return }
  input.value = data
}

// assign a data to the global input
LGraph.prototype.getGlobalInputData = function (name) {
  var input = this.global_inputs[name]
  if (!input) { return null }
  return input.value
}

// rename the global input
LGraph.prototype.renameGlobalInput = function (old_name, name) {
  if (name == old_name) { return }

  if (!this.global_inputs[old_name]) { return false }

  if (this.global_inputs[name]) {
    console.error('there is already one input with that name')
    return false
  }

  this.global_inputs[name] = this.global_inputs[old_name]
  delete this.global_inputs[old_name]

  if (this.onGlobalInputRenamed) { this.onGlobalInputRenamed(old_name, name) }

  if (this.onGlobalsChange) { this.onGlobalsChange() }
}

LGraph.prototype.changeGlobalInputType = function (name, type) {
  if (!this.global_inputs[name]) { return false }

  if (this.global_inputs[name].type.toLowerCase() == type.toLowerCase()) { return }

  this.global_inputs[name].type = type
  if (this.onGlobalInputTypeChanged) { this.onGlobalInputTypeChanged(name, type) }
}

LGraph.prototype.removeGlobalInput = function (name) {
  if (!this.global_inputs[name]) { return false }

  delete this.global_inputs[name]

  if (this.onGlobalInputRemoved) { this.onGlobalInputRemoved(name) }

  if (this.onGlobalsChange) { this.onGlobalsChange() }
  return true
}

LGraph.prototype.addGlobalOutput = function (name, type, value) {
  this.global_outputs[name] = { name: name, type: type, value: value }

  if (this.onGlobalOutputAdded) { this.onGlobalOutputAdded(name, type) }

  if (this.onGlobalsChange) { this.onGlobalsChange() }
}

// assign a data to the global output
LGraph.prototype.setGlobalOutputData = function (name, value) {
  var output = this.global_outputs[ name ]
  if (!output) { return }
  output.value = value
}

// assign a data to the global input
LGraph.prototype.getGlobalOutputData = function (name) {
  var output = this.global_outputs[name]
  if (!output) { return null }
  return output.value
}

// rename the global output
LGraph.prototype.renameGlobalOutput = function (old_name, name) {
  if (!this.global_outputs[old_name]) { return false }

  if (this.global_outputs[name]) {
    console.error('there is already one output with that name')
    return false
  }

  this.global_outputs[name] = this.global_outputs[old_name]
  delete this.global_outputs[old_name]

  if (this.onGlobalOutputRenamed) { this.onGlobalOutputRenamed(old_name, name) }

  if (this.onGlobalsChange) { this.onGlobalsChange() }
}

LGraph.prototype.changeGlobalOutputType = function (name, type) {
  if (!this.global_outputs[name]) { return false }

  if (this.global_outputs[name].type.toLowerCase() == type.toLowerCase()) { return }

  this.global_outputs[name].type = type
  if (this.onGlobalOutputTypeChanged) { this.onGlobalOutputTypeChanged(name, type) }
}

LGraph.prototype.removeGlobalOutput = function (name) {
  if (!this.global_outputs[name]) { return false }
  delete this.global_outputs[name]

  if (this.onGlobalOutputRemoved) { this.onGlobalOutputRemoved(name) }

  if (this.onGlobalsChange) { this.onGlobalsChange() }
  return true
}

/**
* Assigns a value to all the nodes that matches this name. This is used to create global variables of the node that
* can be easily accesed from the outside of the graph
* @method setInputData
* @param {String} name the name of the node
* @param {*} value value to assign to this node
*/

LGraph.prototype.setInputData = function (name, value) {
  var nodes = this.findNodesByName(name)
  for (var i = 0, l = nodes.length; i < l; ++i) { nodes[i].setValue(value) }
}

/**
* Returns the value of the first node with this name. This is used to access global variables of the graph from the outside
* @method setInputData
* @param {String} name the name of the node
* @return {*} value of the node
*/

LGraph.prototype.getOutputData = function (name) {
  var n = this.findNodesByName(name)
  if (n.length) { return m[0].getValue() }
  return null
}

// This feature is not finished yet, is to create graphs where nodes are not executed unless a trigger message is received

LGraph.prototype.triggerInput = function (name, value) {
  var nodes = this.findNodesByName(name)
  for (var i = 0; i < nodes.length; ++i) { nodes[i].onTrigger(value) }
}

LGraph.prototype.setCallback = function (name, func) {
  var nodes = this.findNodesByName(name)
  for (var i = 0; i < nodes.length; ++i) { nodes[i].setTrigger(func) }
}

LGraph.prototype.connectionChange = function (node) {
  this.updateExecutionOrder()
  if (this.onConnectionChange) { this.onConnectionChange(node) }
  this.sendActionToCanvas('onConnectionChange')
}

/**
* returns if the graph is in live mode
* @method isLive
*/

LGraph.prototype.isLive = function () {
  if (!this.list_of_graphcanvas) { return false }

  for (var i = 0; i < this.list_of_graphcanvas.length; ++i) {
    var c = this.list_of_graphcanvas[i]
    if (c.live_mode) { return true }
  }
  return false
}

/* Called when something visually changed */
LGraph.prototype.change = function () {
  if (debug) { console.log('Graph changed') }

  this.sendActionToCanvas('setDirty', [true, true])

  if (this.on_change) { this.on_change(this) }
}

LGraph.prototype.setDirtyCanvas = function (fg, bg) {
  this.sendActionToCanvas('setDirty', [fg, bg])
}

// save and recover app state ***************************************
/**
* Creates a Object containing all the info about this graph, it can be serialized
* @method serialize
* @return {Object} value of the node
*/
LGraph.prototype.serialize = function () {
  var nodes_info = []
  for (var i = 0, l = this._nodes.length; i < l; ++i) { nodes_info.push(this._nodes[i].serialize()) }

// pack link info into a non-verbose format
  var links = []
  for (var i in this.links) // links is an OBJECT
{
    var link = this.links[i]
    links.push([ link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot ])
  }

  var data = {
    iteration: this.iteration,
    frame: this.frame,
    last_node_id: this.last_node_id,
    last_link_id: this.last_link_id,
    links: links, // LiteGraph.cloneObject( this.links ),
    config: this.config,
    nodes: nodes_info
  }

  return data
}

/**
* Configure a graph from a JSON string
* @method configure
* @param {String} str configure a graph from a JSON string
*/
LGraph.prototype.configure = function (data, keep_old) {
  if (!keep_old) { this.clear() }

  var nodes = data.nodes

// decode links info (they are very verbose)
  if (data.links && data.links.constructor === Array) {
    var links = {}
    for (var i = 0; i < data.links.length; ++i) {
      var link = data.links[i]
      links[ link[0] ] = { id: link[0], origin_id: link[1], origin_slot: link[2], target_id: link[3], target_slot: link[4] }
    }
    data.links = links
  }

// copy all stored fields
  for (var i in data) { this[i] = data[i] }

  var error = false

// create nodes
  this._nodes = []
  for (var i = 0, l = nodes.length; i < l; ++i) {
    var n_info = nodes[i] // stored info
    var node = createNode(n_info.type, n_info.title)
    if (!node) {
      if (debug) { console.log('Node not found: ' + n_info.type) }
      error = true
      continue
    }

    node.id = n_info.id // id it or it will create a new id
    this.add(node, true) // add before configure, otherwise configure cannot create links
  }

// configure nodes afterwards so they can reach each other
  for (var i = 0, l = nodes.length; i < l; ++i) {
    var n_info = nodes[i]
    var node = this.getNodeById(n_info.id)
    if (node) { node.configure(n_info) }
  }

  this.updateExecutionOrder()
  this.setDirtyCanvas(true, true)
  return error
}

LGraph.prototype.load = function (url) {
  var that = this
  var req = new XMLHttpRequest()
  req.open('GET', url, true)
  req.send(null)
  req.onload = function (oEvent) {
    if (req.status !== 200) {
      console.error('Error loading graph:', req.status, req.response)
      return
    }
    var data = JSON.parse(req.response)
    that.configure(data)
  }
  req.onerror = function (err) {
    console.error('Error loading graph:', err)
  }
}

LGraph.prototype.onNodeTrace = function (node, msg, color) {
// TODO
}


if (typeof (window) !== undefined && !window['requestAnimationFrame']) {
  window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  function (callback) {
    window.setTimeout(callback, 1000 / 60)
  }
}

  //* External API for module
export {
    LGraph,
    LGraphNode,
    LGraphCanvas,
    createNode,

    registerNodeType,
    allow_scripts
  }
