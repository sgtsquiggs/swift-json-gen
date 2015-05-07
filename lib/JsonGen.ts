/// <reference path="node.d.ts" />

"use strict";

var exec = require('child_process').exec
var path = require('path')
var fs = require('fs')

require('./Extensions')
var ast = require('./SwiftAst')
var printer = require('./SwiftPrinter')

interface FileDesc {
  filename: string;
  fullname: string;
  outfile: string;
  outbase: string;
}

function fileDescriptions(input: string) : Array<FileDesc> {
  var files : Array<FileDesc> = [];

  if (fs.statSync(input).isFile()) {
    var filename = input;
    var dirname = path.dirname(filename)
    var basename = path.basename(filename)
    var outbase = basename.replace('.swift', '+JsonGen.swift');
    var outputFilename = basename.replace('.swift', '+JsonGen.swift');

    var file = {
      filename: basename,
      fullname: path.join(dirname, basename),
      outbase: outbase,
      outfile: path.join(dirname, basename.replace('.swift', '+JsonGen.swift')),
    }
    files = [file]
  }

  if (fs.statSync(input).isDirectory()) {
    var directory = input;

    files = fs.readdirSync(directory)
      .map(function (fn) {
        return {
          filename: fn,
          fullname: path.join(directory, fn),
          outbase: fn.replace('.swift', '+JsonGen.swift'),
          outfile: path.join(directory, fn.replace('.swift', '+JsonGen.swift')),
        }
      })
  }

  return files;
}

function generate() {
  var argv = process.argv;

  if (argv.length < 3) {
    console.log('USAGE: swift-json-gen some/directory/FileWithStructs.swift');
    console.log('');
  }
  else {
    var inputs = argv.slice(2);
    var files = inputs
      .flatMap(fileDescriptions)
      .filter(function (f) {
        var isJsonGen = f.filename.indexOf('+JsonGen.swift') > 0;
        var isSwift = f.filename.indexOf('.swift') > 0;

        return isSwift && !isJsonGen;
      });

    var filenames = files.map(f => '"' + f.fullname + '"').join(' ');
  
    var cmd = 'xcrun swiftc -sdk "$(xcrun --show-sdk-path --sdk macosx)" -dump-ast ' + filenames
    var opts = {
      maxBuffer: 200*1024*1024
    }
  
    exec(cmd, opts, function (error, stdout, stderr) {

      // If an actual error, print and stop
      if (stderr.indexOf('(') != 0) {
        console.error(stderr);
        return;
      }

      var xcoutputs = stderr.split(/\n\(source_file/g)
      if (xcoutputs.length != files.length) {
        console.error('inconsistency; xcoutputs not equal in length to files');
        console.error('xcoutputs.length: ' + xcoutputs.length + ', files: ' + files.length);
      }

      var fileAsts = xcoutputs.map(ast.parse);
      var mergedFileAsts = [].concat.apply([], fileAsts);
      var globalAttrs = ast.globalAttrs(mergedFileAsts);

      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file.filename == 'JsonGen.swift') continue;

        printFile(fileAsts[i], globalAttrs, file.outbase, file.outfile);
      }
    });
  }
}

function printFile(file, globalAttrs, outbase, outfile) {
  var lines = printer.makeFile(file, globalAttrs, outbase);
  var text = lines.join('\n');

  fs.writeFile(outfile, text, err => {
    if (err) {
      console.error(err);
    }
  });
}

exports.generate = generate;

