import {CONSTANTS} from './Constants.js'

var getTime = function getTime () { return Date.now() }

var compareObjects = function (a, b) {
  for (var i in a) {
    if (a[i] != b[i]) { return false }
  }
  return true
}

var distance = function (a, b) {
  return Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]))
}

function colorToString (c) {
  return 'rgba(' + Math.round(c[0] * 255).toFixed() + ',' + Math.round(c[1] * 255).toFixed() + ',' + Math.round(c[2] * 255).toFixed() + ',' + (c.length == 4 ? c[3].toFixed(2) : '1.0') + ')'
}

function isInsideRectangle (x, y, left, top, width, height) {
  if (left < x && (left + width) > x &&
top < y && (top + height) > y) { return true }
  return false
}

// [minx,miny,maxx,maxy]
function growBounding (bounding, x, y) {
  if (x < bounding[0]) { bounding[0] = x } else if (x > bounding[2]) { bounding[2] = x }

  if (y < bounding[1]) { bounding[1] = y } else if (y > bounding[3]) { bounding[3] = y }
}

// point inside boundin box
function isInsideBounding (p, bb) {
  if (p[0] < bb[0][0] ||
p[1] < bb[0][1] ||
p[0] > bb[1][0] ||
p[1] > bb[1][1]) { return false }
  return true
}

// boundings overlap, format: [start,end]
function overlapBounding (a, b) {
  if (a[0] > b[2] ||
a[1] > b[3] ||
a[2] < b[0] ||
a[3] < b[1]) { return false }
  return true
}

// Convert a hex value to its decimal value - the inputted hex must be in the
// format of a hex triplet - the kind we use for HTML colours. The function
// will return an array with three values.
function hex2num (hex) {
  if (hex.charAt(0) == '#') hex = hex.slice(1) // Remove the '#' char - if there is one.
  hex = hex.toUpperCase()
  var hex_alphabets = '0123456789ABCDEF'
  var value = new Array(3)
  var k = 0
  var int1, int2
  for (var i = 0; i < 6; i += 2) {
    int1 = hex_alphabets.indexOf(hex.charAt(i))
    int2 = hex_alphabets.indexOf(hex.charAt(i + 1))
    value[k] = (int1 * 16) + int2
    k++
  }
  return (value)
}

// Give a array with three values as the argument and the function will return
// the corresponding hex triplet.
function num2hex (triplet) {
  var hex_alphabets = '0123456789ABCDEF'
  var hex = '#'
  var int1, int2
  for (var i = 0; i < 3; i++) {
    int1 = triplet[i] / 16
    int2 = triplet[i] % 16

    hex += hex_alphabets.charAt(int1) + hex_alphabets.charAt(int2)
  }
  return (hex)
}

// separated just to improve if it doesnt work
var cloneObject = function (obj, target) {
  if (obj == null) return null
  var r = JSON.parse(JSON.stringify(obj))
  if (!target) return r

  for (var i in r) { target[i] = r[i] }
  return target
}

var isValidConnection = function (type_a, type_b) {
    // generic output
  if (!type_a || !type_b || type_a == type_a || (type_a !== CONSTANTS.EVENT && type_b !== CONSTANTS.EVENT && type_a.toLowerCase() == type_b.toLowerCase())) {
    return true
  }
  return false
}

export {
  num2hex,
  hex2num,
  overlapBounding,
  isInsideRectangle,
  isInsideBounding,
  colorToString,
  distance,
  compareObjects,
  growBounding,
  getTime,
  cloneObject,
  isValidConnection
}
