var glob = Npm.require('glob');
var path = Npm.require('path');

//checks if eval function in package scope available
findEval = function(package) {
  if (Package[package]) {
    var supported_package = _.find(_.values(Package[package]), function(exprt) {
      return exprt && typeof exprt.__serverEval === 'function';
    });
    return supported_package && supported_package.__serverEval;
  }
};

updateMetadata = function() {
  //gather metadata and publish them
  var packages = _.keys(Package);
  var supported_packages = _.filter(packages, function(pkg) {
    return !!findEval(pkg);
  });

  ServerEval._metadata.insert({
    version: ServerEval.version,
    packages: packages,
    supported_packages: supported_packages,
    helpers: _.keys(ServerEval.helpers)
  });
};

var walk = function(dir) {
  var result = {};
  var files = glob.sync(dir, {
    cwd: path.join(process.cwd(), '..', '..', '..', '..', '..')
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

ServerEval.helpers.listFiles = function(path) {
  return walk(path);
};

ServerEval.helpers.updateMetadata = function() {
  updateMetadata();
};