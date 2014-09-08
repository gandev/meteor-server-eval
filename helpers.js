var fs = Npm.require('fs');

var path = Npm.require('path');
var child_process = Npm.require('child_process');
var exec = child_process.exec;

var isLoggingActive = true;
var project_path = process.env.PWD;

var packageExists = function(name) {
  var packagePath = path.join(project_path, 'packages', name);

  return fs.existsSync(packagePath);
};

var executionPath = function(scope) {
  var full_path = project_path;
  if (scope) {
    full_path = path.join(project_path, 'packages', scope);

    if (!packageExists(scope)) {
      full_path = path.join(project_path, 'packages');
      if (!fs.existsSync(full_path)) {
        full_path = project_path;
      }
    }
  }

  return full_path;
};

appName = function() {
  return path.basename(project_path);
};

executeCommand = function(cmd, scope, args, callback) {
  if (typeof callback !== 'function') {
    Log.error("Result callback necessary!");
    return;
  }

  arg = args || [];
  cmd = cmd + ' ' + args.join(' ');

  var wrapped_exec_callback = Meteor.bindEnvironment(function(err, stdout, stderr) {
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
  }, function(err) {
    console.log(err);
  });

  exec(cmd, {
    cwd: executionPath(scope)
  }, wrapped_exec_callback);
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
      var helper_match = helper.match(/^cancel-tests(.*)-(\d*)/) || [];
      if (helper_match.length === 3) {
        //killTestRunner(parseInt(helper_match[2], 10));
        addCancelTestsHelper(helper, helper_match[2]);
      }
    });

    watchTestRunnerLog();
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

createLogMessage = Meteor.bindEnvironment(function(logSource, message, isError) {
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
    logSource: logSource,
    err: isError,
    result: message_obj
  });
}, function(err) {
  if (err) {
    console.log(err);
  }
});

(function redirectStderr() {
  var stderr = process.stderr;
  var stderr_write = stderr.write;
  stderr.write = function(message) {
    stderr_write.apply(stderr, arguments);

    if (isLoggingActive) {
      createLogMessage('app', message, true);
    }
  };
})();

(function redirectStdout() {
  var stdout = process.stdout;
  var stdout_write = stdout.write;
  stdout.write = function(message) {
    stdout_write.apply(stdout, arguments);

    if (isLoggingActive) {
      createLogMessage('app', message);
    }
  };
})();

var removeHelper = function(helper) {
  delete ServerEval.helpers[helper];
  updateMetadata();
};

var killTestRunner = function(pid, fail_log) {
  if (!pid) return;

  try {
    process.kill(pid);

    createLogMessage('tinytest', 'tinytest closed', true);
  } catch (e) {
    if (fail_log) {
      createLogMessage('tinytest', 'tinytest already closed or access denied', true);
    }
  }
};

var addCancelTestsHelper = function(close_helper, pid) {
  ServerEval.helpers[close_helper] = function() {
    killTestRunner(pid, true);
    removeHelper(close_helper);
  };
};

var stdout_file = path.join(project_path, 'tests', 'logs', 'test_runner.stdout');
var stderr_file = path.join(project_path, 'tests', 'logs', 'test_runner.stderr');

var readNewDataFromFile = function(file, isErrorLog) {
  return function(curr, prev) {
    var new_data_length = curr.size - prev.size;
    var new_data = new Buffer(new_data_length);
    fs.open(file, 'r', function(err, fd) {
      if (err) {
        createLogMessage('tinytest', 'cannot open tinytest log', true);
      } else {
        fs.read(fd, new_data, 0, new_data_length, prev.size, function(err, bytesRead, buffer) {
          if (err) {
            createLogMessage('tinytest', 'cannot read tinytest log', true);
          }

          if (curr.mtime != prev.mtime) {
            createLogMessage('tinytest', buffer.toString(), isErrorLog);
          }
        });
      }
    });
  };
};

var stdout_watcher, stderr_watcher;

var watchTestRunnerLog = function() {
  fs.unwatchFile(stdout_file);
  fs.unwatchFile(stderr_file);

  fs.watchFile(stdout_file, {
    interval: 1000
  }, readNewDataFromFile(stdout_file));

  fs.watchFile(stderr_file, {
    interval: 1000
  }, readNewDataFromFile(stderr_file, true));
};

var startTinytest = function(scope, port) {
  try {
    //TODO what if multiple tinytest instances
    fs.unlinkSync(stdout_file);
    fs.unlinkSync(stderr_file);
  } catch (e) { /*dont care, log is already deleted*/ }

  var log_path = path.join(project_path, 'tests');
  if (!fs.existsSync(log_path)) {
    fs.mkdirSync(log_path);
  }

  log_path = path.join(log_path, 'logs');
  if (!fs.existsSync(log_path)) {
    fs.mkdirSync(log_path);
  }

  var test_runner_stdout = fs.openSync(stdout_file, 'a');
  var test_runner_stderr = fs.openSync(stderr_file, 'a');

  var test_runner = child_process.spawn('meteor', ['test-packages', scope, port], {
    cwd: project_path,
    detached: true,
    stdio: ['ignore', test_runner_stdout, test_runner_stderr]
  });

  watchTestRunnerLog();

  var close_helper = 'cancel-tests' + (scope ? '-' + scope : '');
  close_helper = close_helper + '-' + test_runner.pid;

  addCancelTestsHelper(close_helper, test_runner.pid);

  return test_runner;
};

updateMetadata(true);

//helper definitions

ServerEval.helpers['create-package'] = function(scope, args, callback) {
  if (!args || args.length === 0 || args[0] === '') {
    return {
      ____TYPE____: '[Error]',
      err: 'package name required!'
    };
  }

  var name = args[0];

  try {
    if (!packageExists(name)) {
      executeCommand('meteor create --package ' + name, name, [], callback);
    } else {
      throw new Error();
    }
  } catch (err) {
    return {
      ____TYPE____: '[Error]',
      err: 'package ' + name + ' already exists!'
    };
  }
};

ServerEval.helpers['test-package'] = function(scope, args, callback) {
  var port = '--port=5000';
  var nextIsPort = false;
  _.each(args || [], function(arg, idx) {
    var isPortCommand = !!arg.match(/^--port/);
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

  var test_runner = startTinytest(scope, port);

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
