import {CONSTANTS} from './Constants.js'
import {cloneObject} from './MathHelpers.js'

/**
* Base Class for all the node type classes
* @class LGraphNode
* @param {String} name a name for the node
*/

function LGraphNode (title) {
  this._ctor()
}

LGraphNode.prototype._ctor = function (title) {
  this.title = title || 'Unnamed'
  this.size = [CONSTANTS.NODE_WIDTH, 60]
  this.graph = null

  this._pos = new Float32Array(10, 10)

  Object.defineProperty(this, 'pos', {
    set: function (v) {
      if (!v || !v.length < 2) { return }
      this._pos[0] = v[0]
      this._pos[1] = v[1]
    },
    get: function () {
      return this._pos
    },
    enumerable: true
  })

  this.id = -1 // not know till not added
  this.type = null

// inputs available: array of inputs
  this.inputs = []
  this.outputs = []
  this.connections = []

// local data
  this.properties = {} // for the values
  this.properties_info = [] // for the info

  this.data = null // persistent local data
  this.flags = {
// skip_title_render: true,
// unsafe_execution: false,
  }
}

/**
* configure a node from an object containing the serialized info
* @method configure
*/
LGraphNode.prototype.configure = function (info) {
  for (var j in info) {
    if (j == 'console') { continue }

    if (j == 'properties') {
// i dont want to clone properties, I want to reuse the old container
      for (var k in info.properties) {
        this.properties[k] = info.properties[k]
        if (this.onPropertyChanged) { this.onPropertyChanged(k, info.properties[k]) }
      }
      continue
    }

    if (info[j] == null) { continue } else if (typeof (info[j]) === 'object') // object
{
      if (this[j] && this[j].configure) { this[j].configure(info[j]) } else { this[j] = cloneObject(info[j], this[j]) }
    } else // value
{ this[j] = info[j] }
  }

  if (this.onConnectionsChange) {
    if (this.inputs) {
      for (var i = 0; i < this.inputs.length; ++i) {
        var input = this.inputs[i]
        var link_info = this.graph.links[ input.link ]
        this.onConnectionsChange(CONSTANTS.INPUT, i, true, link_info, input) // link_info has been created now, so its updated
      }
    }

    if (this.outputs) {
      for (var i = 0; i < this.outputs.length; ++i) {
        var output = this.outputs[i]
        if (!output.links) { continue }
        for (var j = 0; j < output.links.length; ++j) {
          var link_info = this.graph.links[ output.links[j] ]
          this.onConnectionsChange(CONSTANTS.OUTPUT, i, true, link_info, output) // link_info has been created now, so its updated
        }
      }
    }
  }

// FOR LEGACY, PLEASE REMOVE ON NEXT VERSION
  for (var i in this.inputs) {
    var input = this.inputs[i]
    if (!input.link || !input.link.length) { continue }
    var link = input.link
    if (typeof (link) !== 'object') { continue }
    input.link = link[0]
    this.graph.links[ link[0] ] = {
      id: link[0],
      origin_id: link[1],
      origin_slot: link[2],
      target_id: link[3],
      target_slot: link[4]
    }
  }
  for (var i in this.outputs) {
    var output = this.outputs[i]
    if (!output.links || output.links.length == 0) { continue }
    for (var j in output.links) {
      var link = output.links[j]
      if (typeof (link) !== 'object') { continue }
      output.links[j] = link[0]
    }
  }

  if (this.onConfigure) { this.onConfigure(info) }
}

/**
* serialize the content
* @method serialize
*/

LGraphNode.prototype.serialize = function () {
// clear outputs last data (because data in connections is never serialized but stored inside the outputs info)
  if (this.outputs) {
    for (var i = 0; i < this.outputs.length; i++) { delete this.outputs[i]._data }
  }

// create serialization object
  var o = {
    id: this.id,
    title: this.title,
    type: this.type,
    pos: this.pos,
    size: this.size,
    data: this.data,
    flags: cloneObject(this.flags),
    inputs: this.inputs,
    outputs: this.outputs,
    mode: this.mode
  }

  if (this.properties) { o.properties = cloneObject(this.properties) }

  if (!o.type) { o.type = this.constructor.type }

  if (this.color) { o.color = this.color }
  if (this.bgcolor) { o.bgcolor = this.bgcolor }
  if (this.boxcolor) { o.boxcolor = this.boxcolor }
  if (this.shape) { o.shape = this.shape }

  if (this.onSerialize) { this.onSerialize(o) }

  return o
}

/* Creates a clone of this node */
LGraphNode.prototype.clone = function () {
  var node = createNode(this.type)

// we clone it because serialize returns shared containers
  var data = cloneObject(this.serialize())

// remove links
  if (data.inputs) {
    for (var i = 0; i < data.inputs.length; ++i) { data.inputs[i].link = null }
  }

  if (data.outputs) {
    for (var i = 0; i < data.outputs.length; ++i) {
      if (data.outputs[i].links) { data.outputs[i].links.length = 0 }
    }
  }

  delete data['id']
// remove links
  node.configure(data)

  return node
}

/**
* serialize and stringify
* @method toString
*/

LGraphNode.prototype.toString = function () {
  return JSON.stringify(this.serialize())
}
// LGraphNode.prototype.unserialize = function(info) {} //this cannot be done from within, must be done in LiteGraph

/**
* get the title string
* @method getTitle
*/

LGraphNode.prototype.getTitle = function () {
  return this.title || this.constructor.title
}

// Execution *************************
/**
* sets the output data
* @method setOutputData
* @param {number} slot
* @param {*} data
*/
LGraphNode.prototype.setOutputData = function (slot, data) {
  if (!this.outputs) { return }

  if (slot == -1 || slot >= this.outputs.length) { return }

  var output_info = this.outputs[slot]
  if (!output_info) { return }

// store data in the output itself in case we want to debug
  output_info._data = data

// if there are connections, pass the data to the connections
  if (this.outputs[slot].links) {
    for (var i = 0; i < this.outputs[slot].links.length; i++) {
      var link_id = this.outputs[slot].links[i]
      this.graph.links[ link_id ].data = data
    }
  }
}

/**
* retrieves the input data (data traveling through the connection) from one slot
* @method getInputData
* @param {number} slot
* @param {boolean} force_update if set to true it will force the connected node of this slot to output data into this link
* @return {*} data or if it is not connected returns undefined
*/
LGraphNode.prototype.getInputData = function (slot, force_update) {
  if (!this.inputs) { return } // undefined;

  if (slot >= this.inputs.length || this.inputs[slot].link == null) { return }

  var link_id = this.inputs[slot].link
  var link = this.graph.links[ link_id ]

// used to extract data from the incomming connection
  if (!force_update) { return link.data }

  var node = this.graph.getNodeById(link.origin_id)
  if (!node) { return link.data }

  if (node.updateOutputData) { node.updateOutputData(link.origin_slot) } else if (node.onExecute) { node.onExecute() }

  return link.data
}

/**
* tells you if there is a connection in one input slot
* @method isInputConnected
* @param {number} slot
* @return {boolean}
*/
LGraphNode.prototype.isInputConnected = function (slot) {
  if (!this.inputs) { return false }
  return (slot < this.inputs.length && this.inputs[slot].link != null)
}

/**
* tells you info about an input connection (which node, type, etc)
* @method getInputInfo
* @param {number} slot
* @return {Object} object or null { link: id, name: string, type: string or 0 }
*/
LGraphNode.prototype.getInputInfo = function (slot) {
  if (!this.inputs) { return null }
  if (slot < this.inputs.length) { return this.inputs[slot] }
  return null
}

/**
* returns the node connected in the input slot
* @method getInputNode
* @param {number} slot
* @return {LGraphNode} node or null
*/
LGraphNode.prototype.getInputNode = function (slot) {
  if (!this.inputs) { return null }
  if (slot >= this.inputs.length) { return null }
  var input = this.inputs[slot]
  if (!input || !input.link) { return null }
  var link_info = this.graph.links[ input.link ]
  if (!link_info) { return null }
  return this.graph.getNodeById(link_info.origin_id)
}

/**
* tells you the last output data that went in that slot
* @method getOutputData
* @param {number} slot
* @return {Object}  object or null
*/
LGraphNode.prototype.getOutputData = function (slot) {
  if (!this.outputs) { return null }
  if (slot >= this.outputs.length) { return null }

  var info = this.outputs[slot]
  return info._data
}

/**
* tells you info about an output connection (which node, type, etc)
* @method getOutputInfo
* @param {number} slot
* @return {Object}  object or null { name: string, type: string, links: [ ids of links in number ] }
*/
LGraphNode.prototype.getOutputInfo = function (slot) {
  if (!this.outputs) { return null }
  if (slot < this.outputs.length) { return this.outputs[slot] }
  return null
}

/**
* tells you if there is a connection in one output slot
* @method isOutputConnected
* @param {number} slot
* @return {boolean}
*/
LGraphNode.prototype.isOutputConnected = function (slot) {
  if (!this.outputs) { return null }
  return (slot < this.outputs.length && this.outputs[slot].links && this.outputs[slot].links.length)
}

/**
* retrieves all the nodes connected to this output slot
* @method getOutputNodes
* @param {number} slot
* @return {array}
*/
LGraphNode.prototype.getOutputNodes = function (slot) {
  if (!this.outputs || this.outputs.length == 0) { return null }

  if (slot >= this.outputs.length) { return null }

  var output = this.outputs[slot]
  if (!output.links || output.links.length == 0) { return null }

  var r = []
  for (var i = 0; i < output.links.length; i++) {
    var link_id = output.links[i]
    var link = this.graph.links[ link_id ]
    if (link) {
      var target_node = this.graph.getNodeById(link.target_id)
      if (target_node) { r.push(target_node) }
    }
  }
  return r
}

/**
* Triggers an event in this node, this will trigger any output with the same name
* @method trigger
* @param {String} event name ( "on_play", ... ) if action is equivalent to false then the event is send to all
* @param {*} param
*/
LGraphNode.prototype.trigger = function (action, param) {
  if (!this.outputs || !this.outputs.length) { return }

  if (this.graph) { this.graph._last_trigger_time = getTime() }

  for (var i = 0; i < this.outputs.length; ++i) {
    var output = this.outputs[i]
    if (output.type !== EVENT || (action && output.name != action)) { continue }

    var links = output.links
    if (!links || !links.length) { continue }

// for every link attached here
    for (var k = 0; k < links.length; ++k) {
      var link_info = this.graph.links[ links[k] ]
      if (!link_info) // not connected
  { continue }
      var node = this.graph.getNodeById(link_info.target_id)
      if (!node) // node not found?
  { continue }

// used to mark events in graph
      link_info._last_time = getTime()

      var target_connection = node.inputs[ link_info.target_slot ]

      if (node.onAction) { node.onAction(target_connection.name, param) } else if (node.mode === ON_TRIGGER) {
        if (node.onExecute) { node.onExecute(param) }
      }
    }
  }
}

/**
* add a new property to this node
* @method addProperty
* @param {string} name
* @param {*} default_value
* @param {string} type string defining the output type ("vec3","number",...)
* @param {Object} extra_info this can be used to have special properties of the property (like values, etc)
*/
LGraphNode.prototype.addProperty = function (name, default_value, type, extra_info) {
  var o = { name: name, type: type, default_value: default_value }
  if (extra_info) {
    for (var i in extra_info) { o[i] = extra_info[i] }
  }
  if (!this.properties_info) { this.properties_info = [] }
  this.properties_info.push(o)
  if (!this.properties) { this.properties = {} }
  this.properties[ name ] = default_value
  return o
}

// connections

/**
* add a new output slot to use in this node
* @method addOutput
* @param {string} name
* @param {string} type string defining the output type ("vec3","number",...)
* @param {Object} extra_info this can be used to have special properties of an output (label, special color, position, etc)
*/
LGraphNode.prototype.addOutput = function (name, type, extra_info) {
  var o = { name: name, type: type, links: null }
  if (extra_info) {
    for (var i in extra_info) { o[i] = extra_info[i] }
  }

  if (!this.outputs) { this.outputs = [] }
  this.outputs.push(o)
  if (this.onOutputAdded) { this.onOutputAdded(o) }
  this.size = this.computeSize()
  return o
}

/**
* add a new output slot to use in this node
* @method addOutputs
* @param {Array} array of triplets like [[name,type,extra_info],[...]]
*/
LGraphNode.prototype.addOutputs = function (array) {
  for (var i = 0; i < array.length; ++i) {
    var info = array[i]
    var o = {name: info[0], type: info[1], link: null}
    if (array[2]) {
      for (var j in info[2]) { o[j] = info[2][j] }
    }

    if (!this.outputs) { this.outputs = [] }
    this.outputs.push(o)
    if (this.onOutputAdded) { this.onOutputAdded(o) }
  }

  this.size = this.computeSize()
}

/**
* remove an existing output slot
* @method removeOutput
* @param {number} slot
*/
LGraphNode.prototype.removeOutput = function (slot) {
  this.disconnectOutput(slot)
  this.outputs.splice(slot, 1)
  this.size = this.computeSize()
  if (this.onOutputRemoved) { this.onOutputRemoved(slot) }
}

/**
* add a new input slot to use in this node
* @method addInput
* @param {string} name
* @param {string} type string defining the input type ("vec3","number",...), it its a generic one use 0
* @param {Object} extra_info this can be used to have special properties of an input (label, color, position, etc)
*/
LGraphNode.prototype.addInput = function (name, type, extra_info) {
  type = type || 0
  var o = {name: name, type: type, link: null}
  if (extra_info) {
    for (var i in extra_info) { o[i] = extra_info[i] }
  }

  if (!this.inputs) { this.inputs = [] }
  this.inputs.push(o)
  this.size = this.computeSize()
  if (this.onInputAdded) { this.onInputAdded(o) }
  return o
}

/**
* add several new input slots in this node
* @method addInputs
* @param {Array} array of triplets like [[name,type,extra_info],[...]]
*/
LGraphNode.prototype.addInputs = function (array) {
  for (var i = 0; i < array.length; ++i) {
    var info = array[i]
    var o = {name: info[0], type: info[1], link: null}
    if (array[2]) {
      for (var j in info[2]) { o[j] = info[2][j] }
    }

    if (!this.inputs) { this.inputs = [] }
    this.inputs.push(o)
    if (this.onInputAdded) { this.onInputAdded(o) }
  }

  this.size = this.computeSize()
}

/**
* remove an existing input slot
* @method removeInput
* @param {number} slot
*/
LGraphNode.prototype.removeInput = function (slot) {
  this.disconnectInput(slot)
  this.inputs.splice(slot, 1)
  this.size = this.computeSize()
  if (this.onInputRemoved) { this.onInputRemoved(slot) }
}

/**
* add an special connection to this node (used for special kinds of graphs)
* @method addConnection
* @param {string} name
* @param {string} type string defining the input type ("vec3","number",...)
* @param {[x,y]} pos position of the connection inside the node
* @param {string} direction if is input or output
*/
LGraphNode.prototype.addConnection = function (name, type, pos, direction) {
  var o = {
    name: name,
    type: type,
    pos: pos,
    direction: direction,
    links: null
  }
  this.connections.push(o)
  return o
}

/**
* computes the size of a node according to its inputs and output slots
* @method computeSize
* @param {number} minHeight
* @return {number} the total size
*/
LGraphNode.prototype.computeSize = function (minHeight, out) {
  var rows = Math.max(this.inputs ? this.inputs.length : 1, this.outputs ? this.outputs.length : 1)
  var size = out || new Float32Array([0, 0])
  rows = Math.max(rows, 1)
  size[1] = rows * 14 + 6

  var font_size = 14
  var title_width = compute_text_size(this.title)
  var input_width = 0
  var output_width = 0

  if (this.inputs) {
    for (var i = 0, l = this.inputs.length; i < l; ++i) {
      var input = this.inputs[i]
      var text = input.label || input.name || ''
      var text_width = compute_text_size(text)
      if (input_width < text_width) { input_width = text_width }
    }
  }

  if (this.outputs) {
    for (var i = 0, l = this.outputs.length; i < l; ++i) {
      var output = this.outputs[i]
      var text = output.label || output.name || ''
      var text_width = compute_text_size(text)
      if (output_width < text_width) { output_width = text_width }
    }
  }

  size[0] = Math.max(input_width + output_width + 10, title_width)
  size[0] = Math.max(size[0], NODE_WIDTH)

  function compute_text_size (text) {
    if (!text) { return 0 }
    return font_size * text.length * 0.6
  }

  return size
}

/**
* returns the bounding of the object, used for rendering purposes
* @method getBounding
* @return {Float32Array[4]} the total size
*/
LGraphNode.prototype.getBounding = function () {
  return new Float32Array([this.pos[0] - 4, this.pos[1] - NODE_TITLE_HEIGHT, this.pos[0] + this.size[0] + 4, this.pos[1] + this.size[1] + LGraph.NODE_TITLE_HEIGHT])
}

/**
* checks if a point is inside the shape of a node
* @method isPointInsideNode
* @param {number} x
* @param {number} y
* @return {boolean}
*/
LGraphNode.prototype.isPointInsideNode = function (x, y, margin) {
  margin = margin || 0

  var margin_top = this.graph && this.graph.isLive() ? 0 : 20
  if (this.flags.collapsed) {
// if ( distance([x,y], [this.pos[0] + this.size[0]*0.5, this.pos[1] + this.size[1]*0.5]) < .NODE_COLLAPSED_RADIUS)
    if (isInsideRectangle(x, y, this.pos[0] - margin, this.pos[1] - NODE_TITLE_HEIGHT - margin, NODE_COLLAPSED_WIDTH + 2 * margin, NODE_TITLE_HEIGHT + 2 * margin)) { return true }
  } else if ((this.pos[0] - 4 - margin) < x && (this.pos[0] + this.size[0] + 4 + margin) > x &&
(this.pos[1] - margin_top - margin) < y && (this.pos[1] + this.size[1] + margin) > y) { return true }
  return false
}

/**
* checks if a point is inside a node slot, and returns info about which slot
* @method getSlotInPosition
* @param {number} x
* @param {number} y
* @return {Object} if found the object contains { input|output: slot object, slot: number, link_pos: [x,y] }
*/
LGraphNode.prototype.getSlotInPosition = function (x, y) {
// search for inputs
  if (this.inputs) {
    for (var i = 0, l = this.inputs.length; i < l; ++i) {
      var input = this.inputs[i]
      var link_pos = this.getConnectionPos(true, i)
      if (isInsideRectangle(x, y, link_pos[0] - 10, link_pos[1] - 5, 20, 10)) { return { input: input, slot: i, link_pos: link_pos, locked: input.locked } }
    }
  }

  if (this.outputs) {
    for (var i = 0, l = this.outputs.length; i < l; ++i) {
      var output = this.outputs[i]
      var link_pos = this.getConnectionPos(false, i)
      if (isInsideRectangle(x, y, link_pos[0] - 10, link_pos[1] - 5, 20, 10)) { return { output: output, slot: i, link_pos: link_pos, locked: output.locked } }
    }
  }

  return null
}

/**
* returns the input slot with a given name (used for dynamic slots), -1 if not found
* @method findInputSlot
* @param {string} name the name of the slot
* @return {number} the slot (-1 if not found)
*/
LGraphNode.prototype.findInputSlot = function (name) {
  if (!this.inputs) { return -1 }
  for (var i = 0, l = this.inputs.length; i < l; ++i) {
    if (name == this.inputs[i].name) { return i }
  }
  return -1
}

/**
* returns the output slot with a given name (used for dynamic slots), -1 if not found
* @method findOutputSlot
* @param {string} name the name of the slot
* @return {number} the slot (-1 if not found)
*/
LGraphNode.prototype.findOutputSlot = function (name) {
  if (!this.outputs) return -1
  for (var i = 0, l = this.outputs.length; i < l; ++i) {
    if (name == this.outputs[i].name) { return i }
  }
  return -1
}

/**
* connect this node output to the input of another node
* @method connect
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @param {LGraphNode} node the target node
* @param {number_or_string} target_slot the input slot of the target node (could be the number of the slot or the string with the name of the slot, or -1 to connect a trigger)
* @return {boolean} if it was connected succesfully
*/
LGraphNode.prototype.connect = function (slot, target_node, target_slot) {
  target_slot = target_slot || 0

// seek for the output slot
  if (slot.constructor === String) {
    slot = this.findOutputSlot(slot)
    if (slot == -1) {
      if (debug) { console.log('Connect: Error, no slot of name ' + slot) }
      return false
    }
  } else if (!this.outputs || slot >= this.outputs.length) {
    if (debug) { console.log('Connect: Error, slot number not found') }
    return false
  }

  if (target_node && target_node.constructor === Number) { target_node = this.graph.getNodeById(target_node) }
  if (!target_node) { throw ('Node not found') }

// avoid loopback
  if (target_node == this) { return false }

// you can specify the slot by name
  if (target_slot.constructor === String) {
    target_slot = target_node.findInputSlot(target_slot)
    if (target_slot == -1) {
      if (debug) { console.log('Connect: Error, no slot of name ' + target_slot) }
      return false
    }
  } else if (target_slot === EVENT) {
// search for first slot with event?
/*
//create input for trigger
var input = target_node.addInput("onTrigger", EVENT );
target_slot = target_node.inputs.length - 1; //last one is the one created
target_node.mode = ON_TRIGGER;
*/
    return false
  } else if (!target_node.inputs || target_slot >= target_node.inputs.length) {
    if (debug) { console.log('Connect: Error, slot number not found') }
    return false
  }

// if there is something already plugged there, disconnect
  if (target_node.inputs[ target_slot ].link != null) { target_node.disconnectInput(target_slot) }

// why here??
  this.setDirtyCanvas(false, true)
  this.graph.connectionChange(this)

  var output = this.outputs[slot]

// allows nodes to block connection
  if (target_node.onConnectInput) {
    if (target_node.onConnectInput(target_slot, output.type, output) === false) { return false }
  }

  var input = target_node.inputs[target_slot]

  if (isValidConnection(output.type, input.type)) {
    var link_info = {
      id: this.graph.last_link_id++,
      type: input.type,
      origin_id: this.id,
      origin_slot: slot,
      target_id: target_node.id,
      target_slot: target_slot
    }

// add to graph links list
    this.graph.links[ link_info.id ] = link_info

// connect in output
    if (output.links == null) { output.links = [] }
    output.links.push(link_info.id)
// connect in input
    target_node.inputs[target_slot].link = link_info.id

    if (this.onConnectionsChange) { this.onConnectionsChange(OUTPUT, slot, true, link_info, output) } // link_info has been created now, so its updated
    if (target_node.onConnectionsChange) { target_node.onConnectionsChange(INPUT, target_slot, true, link_info, input) }
  }

  this.setDirtyCanvas(false, true)
  this.graph.connectionChange(this)

  return true
}

/**
* disconnect one output to an specific node
* @method disconnectOutput
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @param {LGraphNode} target_node the target node to which this slot is connected [Optional, if not target_node is specified all nodes will be disconnected]
* @return {boolean} if it was disconnected succesfully
*/
LGraphNode.prototype.disconnectOutput = function (slot, target_node) {
  if (slot.constructor === String) {
    slot = this.findOutputSlot(slot)
    if (slot == -1) {
      if (debug) { console.log('Connect: Error, no slot of name ' + slot) }
      return false
    }
  } else if (!this.outputs || slot >= this.outputs.length) {
    if (debug) { console.log('Connect: Error, slot number not found') }
    return false
  }

// get output slot
  var output = this.outputs[slot]
  if (!output.links || output.links.length == 0) { return false }

// one of the links
  if (target_node) {
    if (target_node.constructor === Number) { target_node = this.graph.getNodeById(target_node) }
    if (!target_node) { throw ('Target Node not found') }

    for (var i = 0, l = output.links.length; i < l; i++) {
      var link_id = output.links[i]
      var link_info = this.graph.links[ link_id ]

// is the link we are searching for...
      if (link_info.target_id == target_node.id) {
        output.links.splice(i, 1) // remove here
        var input = target_node.inputs[ link_info.target_slot ]
        input.link = null // remove there
        delete this.graph.links[ link_id ] // remove the link from the links pool
        if (target_node.onConnectionsChange) { target_node.onConnectionsChange(INPUT, link_info.target_slot, false, link_info, input) } // link_info hasnt been modified so its ok
        if (this.onConnectionsChange) { this.onConnectionsChange(OUTPUT, slot, false, link_info, output) }
        break
      }
    }
  } else // all the links
{
    for (var i = 0, l = output.links.length; i < l; i++) {
      var link_id = output.links[i]
      var link_info = this.graph.links[ link_id ]

      var target_node = this.graph.getNodeById(link_info.target_id)
      var input = null
      if (target_node) {
        input = target_node.inputs[ link_info.target_slot ]
        input.link = null // remove other side link
      }
      delete this.graph.links[ link_id ] // remove the link from the links pool
      if (target_node.onConnectionsChange) { target_node.onConnectionsChange(INPUT, link_info.target_slot, false, link_info, input) } // link_info hasnt been modified so its ok
      if (this.onConnectionsChange) { this.onConnectionsChange(OUTPUT, slot, false, link_info, output) }
    }
    output.links = null
  }

  this.setDirtyCanvas(false, true)
  this.graph.connectionChange(this)
  return true
}

/**
* disconnect one input
* @method disconnectInput
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @return {boolean} if it was disconnected succesfully
*/
LGraphNode.prototype.disconnectInput = function (slot) {
// seek for the output slot
  if (slot.constructor === String) {
    slot = this.findInputSlot(slot)
    if (slot == -1) {
      if (debug) { console.log('Connect: Error, no slot of name ' + slot) }
      return false
    }
  } else if (!this.inputs || slot >= this.inputs.length) {
    if (debug) { console.log('Connect: Error, slot number not found') }
    return false
  }

  var input = this.inputs[slot]
  if (!input) { return false }

  var link_id = this.inputs[slot].link
  this.inputs[slot].link = null

// remove other side
  var link_info = this.graph.links[ link_id ]
  if (link_info) {
    var target_node = this.graph.getNodeById(link_info.origin_id)
    if (!target_node) { return false }

    var output = target_node.outputs[ link_info.origin_slot ]
    if (!output || !output.links || output.links.length == 0) { return false }

// search in the inputs list for this link
    for (var i = 0, l = output.links.length; i < l; i++) {
      var link_id = output.links[i]
      var link_info = this.graph.links[ link_id ]
      if (link_info.target_id == this.id) {
        output.links.splice(i, 1)
        break
      }
    }

    if (this.onConnectionsChange) { this.onConnectionsChange(INPUT, slot, false, link_info, input) }
    if (target_node.onConnectionsChange) { target_node.onConnectionsChange(OUTPUT, i, false, link_info, output) }
  }

  this.setDirtyCanvas(false, true)
  this.graph.connectionChange(this)
  return true
}

/**
* returns the center of a connection point in canvas coords
* @method getConnectionPos
* @param {boolean} is_input true if if a input slot, false if it is an output
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @return {[x,y]} the position
**/
LGraphNode.prototype.getConnectionPos = function (is_input, slot_number) {
  if (this.flags.collapsed) {
    if (is_input) { return [this.pos[0], this.pos[1] - NODE_TITLE_HEIGHT * 0.5] } else { return [this.pos[0] + NODE_COLLAPSED_WIDTH, this.pos[1] - NODE_TITLE_HEIGHT * 0.5] }
// return [this.pos[0] + this.size[0] * 0.5, this.pos[1] + this.size[1] * 0.5];
  }

  if (is_input && slot_number == -1) {
    return [this.pos[0] + 10, this.pos[1] + 10]
  }

  if (is_input && this.inputs.length > slot_number && this.inputs[slot_number].pos) { return [this.pos[0] + this.inputs[slot_number].pos[0], this.pos[1] + this.inputs[slot_number].pos[1]] } else if (!is_input && this.outputs.length > slot_number && this.outputs[slot_number].pos) { return [this.pos[0] + this.outputs[slot_number].pos[0], this.pos[1] + this.outputs[slot_number].pos[1]] }

  if (!is_input) // output
  { return [this.pos[0] + this.size[0] + 1, this.pos[1] + 10 + slot_number * NODE_SLOT_HEIGHT] }
  return [this.pos[0], this.pos[1] + 10 + slot_number * NODE_SLOT_HEIGHT]
}

/* Force align to grid */
LGraphNode.prototype.alignToGrid = function () {
  this.pos[0] = CANVAS_GRID_SIZE * Math.round(this.pos[0] / CANVAS_GRID_SIZE)
  this.pos[1] = CANVAS_GRID_SIZE * Math.round(this.pos[1] / CANVAS_GRID_SIZE)
}

/* Console output */
LGraphNode.prototype.trace = function (msg) {
  if (!this.console) { this.console = [] }
  this.console.push(msg)
  if (this.console.length > LGraphNode.MAX_CONSOLE) { this.console.shift() }

  this.graph.onNodeTrace(this, msg)
}

/* Forces to redraw or the main canvas (LGraphNode) or the bg canvas (links) */
LGraphNode.prototype.setDirtyCanvas = function (dirty_foreground, dirty_background) {
  if (!this.graph) { return }
  this.graph.sendActionToCanvas('setDirty', [dirty_foreground, dirty_background])
}

LGraphNode.prototype.loadImage = function (url) {
  var img = new Image()
  img.src = node_images_path + url
  img.ready = false

  var that = this
  img.onload = function () {
    this.ready = true
    that.setDirtyCanvas(true)
  }
  return img
}

// safe LGraphNode action execution (not sure if safe)
/*
LGraphNode.prototype.executeAction = function(action)
{
if(action == "") return false;

if( action.indexOf(";") != -1 || action.indexOf("}") != -1)
{
this.trace("Error: Action contains unsafe characters");
return false;
}

var tokens = action.split("(");
var func_name = tokens[0];
if( typeof(this[func_name]) != "function")
{
this.trace("Error: Action not found on node: " + func_name);
return false;
}

var code = action;

try
{
var _foo = eval;
eval = null;
(new Function("with(this) { " + code + "}")).call(this);
eval = _foo;
}
catch (err)
{
this.trace("Error executing action {" + action + "} :" + err);
return false;
}

return true;
}
*/

/* Allows to get onMouseMove and onMouseUp events even if the mouse is out of focus */
LGraphNode.prototype.captureInput = function (v) {
  if (!this.graph || !this.graph.list_of_graphcanvas) { return }

  var list = this.graph.list_of_graphcanvas

  for (var i = 0; i < list.length; ++i) {
    var c = list[i]
// releasing somebody elses capture?!
    if (!v && c.node_capturing_input != this) { continue }

// change
    c.node_capturing_input = v ? this : null
  }
}

/**
* Collapse the node to make it smaller on the canvas
* @method collapse
**/
LGraphNode.prototype.collapse = function () {
  if (!this.flags.collapsed) { this.flags.collapsed = true } else { this.flags.collapsed = false }
  this.setDirtyCanvas(true, true)
}

/**
* Forces the node to do not move or realign on Z
* @method pin
**/

LGraphNode.prototype.pin = function (v) {
  if (v === undefined) { this.flags.pinned = !this.flags.pinned } else { this.flags.pinned = v }
}

LGraphNode.prototype.localToScreen = function (x, y, graphcanvas) {
  return [(x + this.pos[0]) * graphcanvas.scale + graphcanvas.offset[0],
    (y + this.pos[1]) * graphcanvas.scale + graphcanvas.offset[1]]
}

// // API *************************************************
// // function roundRect(ctx, x, y, width, height, radius, radius_low) {
//   if (CanvasRenderingContext2D !== undefined) {
//     CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius, radius_low) {
//       if (radius === undefined) {
//         radius = 5
//       }

//       if (radius_low === undefined) { radius_low = radius }

//       this.beginPath()
//       this.moveTo(x + radius, y)
//       this.lineTo(x + width - radius, y)
//       this.quadraticCurveTo(x + width, y, x + width, y + radius)

//       this.lineTo(x + width, y + height - radius_low)
//       this.quadraticCurveTo(x + width, y + height, x + width - radius_low, y + height)
//       this.lineTo(x + radius_low, y + height)
//       this.quadraticCurveTo(x, y + height, x, y + height - radius_low)
//       this.lineTo(x, y + radius)
//       this.quadraticCurveTo(x, y, x + radius, y)
//     }
//   }
