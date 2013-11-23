var glob = Npm.require('glob');
var path = Npm.require('path');

var walk = function(dir) {
  var result = {};
  var files = glob.sync(dir, {
    cwd: '/'
  });

  var addToResult = function(file, path) {
    if (path.length === 0) {
      result[file] = 'file';
    }

    var obj = result;
    for (var i = 0; i < path.length; i++) {
      var key = path[i];
      if (_.isEmpty(key)) continue;

      if (!(key in obj) || _.isString(obj[key])) {
        obj[key] = {};
      }

      obj = obj[key];

      if (path.length - 1 === i) {
        obj[file] = 'file';
      }
    }
  };

  for (var i = 0; i < files.length; i++) {
    var file_path = files[i].split(path.sep);
    var file = file_path.pop();

    addToResult(file, file_path);
  }
  return result;
};

ServerEval.ls = function(path) {
  var metadata = ServerEval._metadata.findOne();
  ServerEval._metadata.update(metadata._id, {
    '$set': {
      ls: walk(path)
    }
  });
};