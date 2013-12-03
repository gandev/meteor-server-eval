//Copyright © 2012 Paul Vorbach (https://github.com/pvorb/node-git-wrapper)

// imports
var fs = Npm.require('fs');
var path = Npm.require('path');
var exec = Npm.require('child_process').exec;

// Class Git
Git = function(options) {
  this.binary = 'git';
  if (typeof options == 'undefined')
    options = {};

  this.args = Git.optionsToString(options);
  this.cwd = '/';
};

// git.exec(command [[, options], args ], callback)
Git.prototype.exec = function(command, options, args, callback) {
  callback = arguments[arguments.length - 1];

  if (arguments.length == 2) {
    options = {};
    args = [];
  } else if (arguments.length == 3) {
    args = arguments[1];
    options = [];
  }

  args = args.join(' ');
  options = Git.optionsToString(options);

  var cmd = this.binary + ' ' + this.args + ' ' + command + ' ' + options + ' ' + args;

  exec(cmd, {
    cwd: this.cwd,
    encoding: 'binary'
  }, function(err, stdout, stderr) {
    callback(err, stdout);
  });
};

// converts an object that contains key value pairs to a argv string
Git.optionsToString = function(options) {
  var args = [];

  for (var k in options) {
    var val = options[k];

    if (k.length == 1) {
      // val is true, add '-k'
      if (val === true)
        args.push('-' + k);
      // if val is not false, add '-k val'
      else if (val !== false)
        args.push('-' + k + ' ' + val);
    } else {
      if (val === true)
        args.push('--' + k);
      else if (val !== false)
        args.push('--' + k + '=' + val);
    }
  }

  return args.join(' ');
};