
const path = require('path')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'litegraph.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'LITEGRAPH',
    libraryTarget: 'var'
  }
}
