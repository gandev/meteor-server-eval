var path = Npm.require('path');

var project_path = path.join(process.cwd(), '..', '..', '..', '..', '..');

var git = new Git({
  'exec-path': project_path
});

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

var executeGit = function(command, callback, args) {
  var options = {};
  git.exec(command, options, args || [], function(err, msg) {
    var result = {
      output: msg
    };

    if (err) {
      result = err;
    }

    callback(result);
  });
};

ServerEval.helpers.git = function(callback, args) {
  args = args || [];
  var command = args[0];

  executeGit(command, callback, args.slice(1));
};

ServerEval.helpers.gitStatus = function(callback) {
  executeGit('status', callback);
};

ServerEval.helpers.gitDiff = function(callback) {
  executeGit('diff', callback);
};