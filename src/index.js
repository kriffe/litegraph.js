
import * as LITEGRAPH from '../src/litegraph.js'

// import * as DelayEvent from '../src/nodes/events.js'
import * as BASE from '../src/nodes/base.js'

// LiteGraph.registerNodeType('events/delay', DelayEvent)

LITEGRAPH.registerNodeType('basic/time', BASE.Time)
LITEGRAPH.registerNodeType('basic/script', BASE.NodeScript)
LITEGRAPH.registerNodeType('graph/subgraph', BASE.Subgraph)
LITEGRAPH.registerNodeType('graph/input', BASE.GlobalInput)
LITEGRAPH.registerNodeType('graph/output', BASE.GlobalOutput)
LITEGRAPH.registerNodeType('basic/const', BASE.Constant)
LITEGRAPH.registerNodeType('basic/watch', BASE.Watch)
LITEGRAPH.registerNodeType('basic/console', BASE.Console)


export {
  LITEGRAPH
}
