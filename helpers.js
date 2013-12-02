var path = Npm.require('path');

var project_path = path.join(process.cwd(), '..', '..', '..', '..', '..');

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

//helper definitions

ServerEval.helpers.updateMetadata = function() {
  updateMetadata();
};

ServerEval.helpers.gitStatus = function(callback, hash) {
  var git = new Git({
    'git-dir': project_path + '/.git'
  });

  git.exec('status', function(err, msg) {
    callback.call(null, msg);
  });
};