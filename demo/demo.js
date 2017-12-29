import {LITEGRAPH} from '/dist/litegraph.module.js'

var graph = new LITEGRAPH.LGraph()

var graphcanvas = new LITEGRAPH.LGraphCanvas('#litegraphcanvas', graph)
graphcanvas.resize()

  // var node_button = LITEGRAPH.createNode('widget/button')
  // node_button.pos = [100, 400]
  // graph.add(node_button)

var nodeConsole = LITEGRAPH.createNode('basic/console')
nodeConsole.pos = [400, 400]
graph.add(nodeConsole)

var nodeConstA = LITEGRAPH.createNode('basic/const')
nodeConstA.pos = [200, 200]
graph.add(nodeConstA)
nodeConstA.setValue(4.5)

var nodeConstB = LITEGRAPH.createNode('basic/const')
nodeConstB.pos = [200, 300]
graph.add(nodeConstB)
nodeConstB.setValue(10)

  // var node_math = createNode('math/operation')
  // node_math.pos = [400, 200]
  // graph.add(node_math)

var nodeWatch = LITEGRAPH.createNode('basic/watch')
nodeWatch.pos = [700, 200]
graph.add(nodeWatch)

var nodeWatch2 = LITEGRAPH.createNode('basic/watch')
nodeWatch2.pos = [700, 300]
graph.add(nodeWatch2)

nodeConstA.connect(0, nodeWatch, 0)
nodeConstB.connect(0, nodeWatch2, 0)
nodeConstA.connect(0, nodeConsole, 0)
  // node_math.connect(0, node_watch, 0)
  // node_math.connect(0, node_watch2, 0)

// LiteGraph.node_images_path = "../nodes_data/";
graphcanvas.background_image = 'imgs/grid.png'
graph.onAfterExecute = function () { graphcanvas.draw(true) }

graph.runStep(1)
