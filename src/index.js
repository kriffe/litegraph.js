
import {registerNodeType, createNode, LGraph, LGraphNode, LGraphCanvas} from '../src/litegraph.js'

// import * as DelayEvent from '../src/nodes/events.js'
import * as BASE from '../src/nodes/base.js'

// LiteGraph.registerNodeType('events/delay', DelayEvent)

registerNodeType('basic/time', BASE.Time)
registerNodeType('basic/script', BASE.NodeScript)
registerNodeType('graph/subgraph', BASE.Subgraph)
registerNodeType('graph/input', BASE.GlobalInput)
registerNodeType('graph/output', BASE.GlobalOutput)
registerNodeType('basic/const', BASE.Constant)
registerNodeType('basic/watch', BASE.Watch)
registerNodeType('basic/console', BASE.Console)

export {
  registerNodeType,
  createNode,
  LGraphCanvas,
  LGraphNode,
  LGraph
}
