var path = Npm.require('path');

var project_path = path.join(process.cwd(), '..', '..', '..', '..', '..');

var isLoggingActive = false;

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

updateMetadata = function(initial) {
  //gather metadata and publish them
  var packages = _.keys(Package);
  var supported_packages = _.filter(packages, function(pkg) {
    return !!findEval(pkg);
  });

  var old_metadata = ServerEval._metadata.findOne({
    version: ServerEval.version
  });
  if (initial && old_metadata && old_metadata.logging) {
    isLoggingActive = true;
  }

  ServerEval._metadata.upsert({
    version: ServerEval.version
  }, {
    version: ServerEval.version,
    packages: packages,
    supported_packages: supported_packages,
    helpers: _.keys(ServerEval.helpers),
    logging: isLoggingActive
  });
};

updateMetadata(true);

var createLogMessage = function(message, isError) {
  var message_obj;
  try {
    message_obj = EJSON.parse(message);
  } catch (e) {
    message_obj = {
      message: message
    };
  }

  if (isLoggingActive) {
    ServerEval._results.insert({
      eval_time: Date.now(),
      log: true,
      err: isError,
      result: prettyResult(message_obj)
    });
  }
};

(function redirectStderr() {
  var stderr = process.stderr;
  var stderr_write = stderr.write;

  stderr.write = function() {
    stderr_write.apply(stderr, arguments);

    var message = _.toArray(arguments)[0];
    createLogMessage(message, true);
  };
})();

(function redirectStdout() {
  var stdout = process.stdout;
  var stdout_write = stdout.write;

  stdout.write = function() {
    stdout_write.apply(stdout, arguments);

    var message = _.toArray(arguments)[0];
    createLogMessage(message);
  };
})();

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

//helper definitions

ServerEval.helpers.updateMetadata = function() {
  updateMetadata();
};

ServerEval.helpers.toggleLogging = function() {
  isLoggingActive = !isLoggingActive;
  updateMetadata();
  return isLoggingActive ? 'ON' : 'OFF';
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

ServerEval.helpers.gitLog = function(callback) {
  executeGit('log', callback);
};

ServerEval.helpers.gitReflog = function(callback) {
  executeGit('reflog', callback);
};