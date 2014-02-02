var fs = Npm.require('fs');
var path = Npm.require('path');
var child_process = Npm.require('child_process');
var exec = child_process.exec;

var isLoggingActive = true;
var project_path = path.join(process.cwd(), '..', '..', '..', '..', '..');

appName = function() {
  return path.basename(project_path);
};

var executionPath = function(scope) {
  var full_path = scope ? path.join(project_path, 'packages', scope) : project_path;
  return fs.existsSync(full_path) ? full_path : project_path;
};

executeCommand = function(cmd, scope, args, callback) {
  if (typeof callback !== 'function') {
    Log.error("Result callback necessary!");
    return;
  }

  arg = args || [];
  cmd = cmd + ' ' + args.join(' ');

  exec(cmd, {
    cwd: executionPath(scope)
  }, function(err, stdout, stderr) {
    var err_result;
    if (err) {
      err_result = err;
    } else if (stderr) {
      err_result = {
        ____TYPE____: '[Error]',
        err: stderr
      };
    }

    if (err_result) {
      callback(err_result);
    } else {
      callback({
        message: stdout
      }, {
        log: true
      });
    }
  });
};

//checks if eval function in package scope available
findEval = function(package) {
  if (Package[package]) {
    var supported_package = _.find(_.values(Package[package]), function(exprt) {
      return exprt && typeof exprt.__serverEval === 'function';
    });
    return supported_package && supported_package.__serverEval;
  }
};

var addCancelTestsHelper = function(helper_name, pid, detached) {
  ServerEval.helpers[helper_name] = function() {
    try {
      process.kill(pid);
      if (detached) {
        console.log('test runner closed');
      }
    } catch (e) {
      console.log('test runner already closed or access denied');
    }
    delete ServerEval.helpers[helper_name];
    updateMetadata();
  };
};

updateMetadata = function(initial) {
  //gather metadata and publish them
  var packages = _.keys(Package);
  packages = _.filter(packages, function(pkg) {
    return fs.existsSync(path.join(project_path, 'packages', pkg));
  });

  var supported_packages = _.filter(packages, function(pkg) {
    return !!findEval(pkg);
  });

  var old_metadata = ServerEval._metadata.findOne({
    version: ServerEval.version
  });
  if (initial && old_metadata) {
    isLoggingActive = old_metadata.logging;

    _.each(old_metadata.helpers, function(helper) {
      var helper_match = helper.match(/^cancel-tests.*-(\d*)/) || [];
      if (helper_match.length === 2) {
        addCancelTestsHelper(helper, parseInt(helper_match[1], 10), true);
      }
    });
  }

  ServerEval._metadata.upsert({
    version: ServerEval.version
  }, {
    version: ServerEval.version,
    appName: appName(),
    packages: packages,
    supported_packages: supported_packages,
    helpers: _.keys(ServerEval.helpers),
    logging: isLoggingActive,
    project_path: project_path
  });
};

updateMetadata(true);

createLogMessage = function(message, isError) {
  var message_obj;
  try {
    message_obj = EJSON.parse(message);
  } catch (e) {
    message_obj = {
      message: message
    };
  }

  ServerEval._results.insert({
    eval_time: Date.now(),
    log: true,
    err: isError,
    result: message_obj
  });
};

(function redirectStderr() {
  var stderr = process.stderr;
  var stderr_write = stderr.write;
  stderr.write = function(message) {
    stderr_write.apply(stderr, arguments);

    if (isLoggingActive) {
      createLogMessage(message, true);
    }
  };
})();

(function redirectStdout() {
  var stdout = process.stdout;
  var stdout_write = stdout.write;
  stdout.write = function(message) {
    stdout_write.apply(stdout, arguments);

    if (isLoggingActive) {
      createLogMessage(message);
    }
  };
})();

//helper definitions

ServerEval.helpers['test-packages'] = function(scope, args, callback) {
  var port = '--port=5000';
  var nextIsPort = false;
  _.each(args || [], function(arg, idx) {
    var isPortCommand = !! arg.match(/^--port/);
    if (!isPortCommand && idx === 0 && arg.length > 0) {
      if (arg === '.') {
        scope = null; //used to start in whole app, even in package scope
      } else {
        scope = arg;
      }
      return;
    }

    var arg_match = arg.match(/^--port=(\d*)/);
    if (arg_match && arg_match.length === 2) {
      port = arg;
    } else if (nextIsPort) {
      if (!isNaN(parseInt(arg, 10))) {
        port = '--port=' + arg;
      }
      nextIsPort = false;
    } else {
      nextIsPort = isPortCommand;
    }
  });

  var test_runner = child_process.spawn('meteor', ['test-packages', scope, port], {
    cwd: project_path,
    detached: true
  });

  test_runner.stdout.on('data', function(data) {
    console.log(data.toString());
  });

  test_runner.stderr.on('data', function(data) {
    console.log(data.toString());
  });

  var close_helper = 'cancel-tests' + (scope ? '-' + scope : '');
  close_helper = close_helper + '-' + test_runner.pid;

  var handleTestRunnerClose = Meteor.bindEnvironment(function(code) {
    console.log('test runner closed');
    delete ServerEval.helpers[close_helper];
    updateMetadata();
  }, function(err) {
    console.log(err);
  });

  test_runner.on('close', handleTestRunnerClose);

  addCancelTestsHelper(close_helper, test_runner.pid);

  updateMetadata();

  return {
    ____TYPE____: '[Tinytest]',
    pid: test_runner.pid,
    port: parseInt(port.substr(7), 10)
  };
};

ServerEval.helpers.updateMetadata = function() {
  updateMetadata();
};

ServerEval.helpers.toggleLogging = function() {
  isLoggingActive = !isLoggingActive;
  updateMetadata();
  return isLoggingActive ? 'ON' : 'OFF';
};