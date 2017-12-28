module.exports = function (grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    concat: {
      build: {
        src: ['dist/litegraph.js', 'utils/export.js'],
        dest: 'dist/litegraph.module.js'
      }
    },
    copy: { },
    clean: {
      build: {src: ['dist/*']}
    }
  })

  grunt.loadNpmTasks('grunt-contrib-concat')
  grunt.loadNpmTasks('grunt-contrib-copy')
  grunt.loadNpmTasks('grunt-closure-tools')
  grunt.loadNpmTasks('grunt-contrib-clean')
}
