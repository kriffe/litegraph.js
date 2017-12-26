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


var EVENT = -1 // for outputs
var ACTION = -1 // for inputs



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

var registerNodeType = function (type, base_class) {
  if (!base_class.prototype) { throw ('Cannot register a simple object, it must be a class with a prototype') }
  base_class.type = type

  if (debug) { console.log('Node registered: ' + type) }

  var categories = type.split('/')
  var classname = base_class.constructor.name

  var pos = type.lastIndexOf('/')
  base_class.category = type.substr(0, pos)

  if (!base_class.title) { base_class.title = classname }
// info.name = name.substr(pos+1,name.length - pos);

// extend class
  if (base_class.prototype) // is a class
      {
    for (var i in LGraphNode.prototype) {
      if (!base_class.prototype[i]) { base_class.prototype[i] = LGraphNode.prototype[i] }
    }
  }

  registered_node_types[ type ] = base_class
  if (base_class.constructor.name) { Nodes[ classname ] = base_class }

// warnings
  if (base_class.prototype.onPropertyChange) { console.warn('LiteGraph node class ' + type + ' has onPropertyChange method, it must be called onPropertyChanged with d at the end') }

  if (base_class.supported_extensions) {
    for (var i in base_class.supported_extensions) { node_types_by_file_extension[ base_class.supported_extensions[i].toLowerCase() ] = base_class }
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
  var base_class = registered_node_types[type]
  if (!base_class) {
    if (debug) { console.log('GraphNode type "' + type + '" not registered.') }
    return null
  }

  var prototype = base_class.prototype || base_class

  title = title || base_class.title || type

  var node = new base_class(name)
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
    } else if (registered_node_types[i].category == category) { r.push(registered_node_types[i]) }
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

LGraph.STATUS_STOPPED = 1
LGraph.STATUS_RUNNING = 2

/**
* Removes all nodes from this graph
* @method clear
*/

LGraph.prototype.clear = function () {
  this.stop()
  this.status = LGraph.STATUS_STOPPED
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
  if (graphcanvas.constructor != LGraphCanvas) { throw ('attachCanvas expects a LGraphCanvas instance') }
  if (graphcanvas.graph && graphcanvas.graph != this) { graphcanvas.graph.detachCanvas(graphcanvas) }

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
  if (this.status == LGraph.STATUS_RUNNING) { return }
  this.status = LGraph.STATUS_RUNNING

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
  if (this.status == LGraph.STATUS_STOPPED) { return }

  this.status = LGraph.STATUS_STOPPED

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

LGraph.prototype.runStep = function (num, do_not_catch_errors) {
  num = num || 1

  var start = getTime()
  this.globaltime = 0.001 * (start - this.starttime)

  var nodes = this._nodes_executable ? this._nodes_executable : this._nodes
  if (!nodes) { return }

  if (do_not_catch_errors) {
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

  if (this._nodes.length >= MAX_NUMBER_OF_NODES) { throw ('LiteGraph: max number of nodes in a graph reached') }

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

/* GUI elements used for canvas editing *************************************/

/**
* ContextMenu from LiteGUI
*
* @class ContextMenu
* @constructor
* @param {Array} values (allows object { title: "Nice text", callback: function ... })
* @param {Object} options [optional] Some options:\
* - title: title to show on top of the menu
* - callback: function to call when an option is clicked, it receives the item information
* - ignore_item_callbacks: ignores the callback inside the item, it just calls the options.callback
* - event: you can pass a MouseEvent, this way the ContextMenu appears in that position
*/
function ContextMenu (values, options) {
  options = options || {}
  this.options = options
  var that = this

// to link a menu with its parent
  if (options.parentMenu) {
    if (options.parentMenu.constructor !== this.constructor) {
      console.error('parentMenu must be of class ContextMenu, ignoring it')
      options.parentMenu = null
    } else {
      this.parentMenu = options.parentMenu
      this.parentMenu.lock = true
      this.parentMenu.current_submenu = this
    }
  }

  if (options.event && options.event.constructor !== MouseEvent && options.event.constructor !== CustomEvent) {
    console.error('Event passed to ContextMenu is not of type MouseEvent or CustomEvent. Ignoring it.')
    options.event = null
  }

  var root = document.createElement('div')
  root.className = 'LiteGraph litecontextmenu litemenubar-panel'
  root.style.minWidth = 100
  root.style.minHeight = 100
  root.style.pointerEvents = 'none'
  setTimeout(function () { root.style.pointerEvents = 'auto' }, 100) // delay so the mouse up event is not caugh by this element

// this prevents the default context browser menu to open in case this menu was created when pressing right button
  root.addEventListener('mouseup', function (e) {
    e.preventDefault(); return true
  }, true)
  root.addEventListener('contextmenu', function (e) {
    if (e.button != 2) // right button
  { return false }
    e.preventDefault()
    return false
  }, true)

  root.addEventListener('mousedown', function (e) {
    if (e.button == 2) {
      that.close()
      e.preventDefault(); return true
    }
  }, true)

  this.root = root

// title
  if (options.title) {
    var element = document.createElement('div')
    element.className = 'litemenu-title'
    element.innerHTML = options.title
    root.appendChild(element)
  }

// entries
  var num = 0
  for (var i in values) {
    var name = values.constructor == Array ? values[i] : i
    if (name != null && name.constructor !== String) { name = name.content === undefined ? String(name) : name.content }
    var value = values[i]
    this.addItem(name, value, options)
    num++
  }

// close on leave
  root.addEventListener('mouseleave', function (e) {
    if (that.lock) { return }
    that.close(e)
  })

// insert before checking position
  var root_document = document
  if (options.event) { root_document = options.event.target.ownerDocument }

  if (!root_document) { root_document = document }
  root_document.body.appendChild(root)

// compute best position
  var left = options.left || 0
  var top = options.top || 0
  if (options.event) {
    left = (options.event.pageX - 10)
    top = (options.event.pageY - 10)
    if (options.title) { top -= 20 }

    if (options.parentMenu) {
      var rect = options.parentMenu.root.getBoundingClientRect()
      left = rect.left + rect.width
    }

    var body_rect = document.body.getBoundingClientRect()
    var root_rect = root.getBoundingClientRect()

    if (left > (body_rect.width - root_rect.width - 10)) { left = (body_rect.width - root_rect.width - 10) }
    if (top > (body_rect.height - root_rect.height - 10)) { top = (body_rect.height - root_rect.height - 10) }
  }

  root.style.left = left + 'px'
  root.style.top = top + 'px'
}

ContextMenu.prototype.addItem = function (name, value, options) {
  var that = this
  options = options || {}

  var element = document.createElement('div')
  element.className = 'litemenu-entry submenu'

  var disabled = false

  if (value === null) {
    element.classList.add('separator')
// element.innerHTML = "<hr/>"
// continue;
  } else {
    element.innerHTML = value && value.title ? value.title : name
    element.value = value

    if (value) {
      if (value.disabled) {
        disabled = true
        element.classList.add('disabled')
      }
      if (value.submenu || value.has_submenu) { element.classList.add('has_submenu') }
    }

    if (typeof (value) === 'function') {
      element.dataset['value'] = name
      element.onclick_callback = value
    } else { element.dataset['value'] = value }
  }

  this.root.appendChild(element)
  if (!disabled) { element.addEventListener('click', inner_onclick) }
  if (options.autoopen) { element.addEventListener('mouseenter', inner_over) }

  function inner_over (e) {
    var value = this.value
    if (!value || !value.has_submenu) { return }
    inner_onclick.call(this, e)
  }

// menu option clicked
  function inner_onclick (e) {
    var value = this.value
    var close_parent = true

    if (that.current_submenu) { that.current_submenu.close(e) }

// global callback
    if (options.callback) {
      var r = options.callback.call(this, value, options, e, that, options.node)
      if (r === true) { close_parent = false }
    }

// special cases
    if (value) {
      if (value.callback && !options.ignore_item_callbacks && value.disabled !== true)  // item callback
{
        var r = value.callback.call(this, value, options, e, that, options.node)
        if (r === true) { close_parent = false }
      }
      if (value.submenu) {
        if (!value.submenu.options) { throw ('ContextMenu submenu needs options') }
        var submenu = new that.constructor(value.submenu.options, {
          callback: value.submenu.callback,
          event: e,
          parentMenu: that,
          ignore_item_callbacks: value.submenu.ignore_item_callbacks,
          title: value.submenu.title,
          autoopen: options.autoopen
        })
        close_parent = false
      }
    }

    if (close_parent && !that.lock) { that.close() }
  }

  return element
}

ContextMenu.prototype.close = function (e, ignore_parent_menu) {
  if (this.root.parentNode) { this.root.parentNode.removeChild(this.root) }
  if (this.parentMenu && !ignore_parent_menu) {
    this.parentMenu.lock = false
    this.parentMenu.current_submenu = null
    if (e === undefined) { this.parentMenu.close() } else if (e && !ContextMenu.isCursorOverElement(e, this.parentMenu.root)) {
      ContextMenu.trigger(this.parentMenu.root, 'mouseleave', e)
    }
  }
  if (this.current_submenu) { this.current_submenu.close(e, true) }
}

// this code is used to trigger events easily (used in the context menu mouseleave
ContextMenu.trigger = function (element, event_name, params, origin) {
  var evt = document.createEvent('CustomEvent')
  evt.initCustomEvent(event_name, true, true, params) // canBubble, cancelable, detail
  evt.srcElement = origin
  if (element.dispatchEvent) { element.dispatchEvent(evt) } else if (element.__events) { element.__events.dispatchEvent(evt) }
// else nothing seems binded here so nothing to do
  return evt
}

// returns the top most menu
ContextMenu.prototype.getTopMenu = function () {
  if (this.options.parentMenu) { return this.options.parentMenu.getTopMenu() }
  return this
}

ContextMenu.prototype.getFirstEvent = function () {
  if (this.options.parentMenu) { return this.options.parentMenu.getFirstEvent() }
  return this.options.event
}

ContextMenu.isCursorOverElement = function (event, element) {
  var left = event.pageX
  var top = event.pageY
  var rect = element.getBoundingClientRect()
  if (!rect) { return false }
  if (top > rect.top && top < (rect.top + rect.height) &&
left > rect.left && left < (rect.left + rect.width)) { return true }
  return false
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

function extendClass (target, origin) {
  for (var i in origin) // copy class properties
{
    if (target.hasOwnProperty(i)) { continue }
    target[i] = origin[i]
  }

  if (origin.prototype) // copy prototype properties
  {
    for (var i in origin.prototype) // only enumerables
{
      if (!origin.prototype.hasOwnProperty(i)) { continue }

      if (target.prototype.hasOwnProperty(i)) // avoid overwritting existing ones
  { continue }

// copy getters
      if (origin.prototype.__lookupGetter__(i)) { target.prototype.__defineGetter__(i, origin.prototype.__lookupGetter__(i)) } else { target.prototype[i] = origin.prototype[i] }

// and setters
      if (origin.prototype.__lookupSetter__(i)) { target.prototype.__defineSetter__(i, origin.prototype.__lookupSetter__(i)) }
    }
  }
}

/*
LiteGraph.createNodetypeWrapper = function( class_object )
{
//create Nodetype object
}
//LiteGraph.registerNodeType("scene/global", LGraphGlobal );
*/

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
    ACTION,
    EVENT,
    registerNodeType,
    allow_scripts
  }
