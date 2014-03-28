var fs = Npm.require('fs');
var fs_mkdir = Meteor._wrapAsync(fs.mkdir);

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

var removeHelper = function(helper) {
  delete ServerEval.helpers[helper];
  updateMetadata();
};

var killTestRunner = function(pid, fail_log) {
  if (!pid) return;

  try {
    process.kill(pid);
    console.log('test runner closed');
  } catch (e) {
    if (fail_log) {
      console.error('test runner already closed or access denied');
    }
  }
};

var addCancelTestsHelper = function(close_helper, pid) {
  ServerEval.helpers[close_helper] = function() {
    killTestRunner(pid, true);
    removeHelper(close_helper);
  };
};

var stdout_file = path.join(executionPath('server-eval'), 'logs', 'test_runner.stdout');
var stderr_file = path.join(executionPath('server-eval'), 'logs', 'test_runner.stderr');

var readNewDataFromFile = function(file) {
  return function(curr, prev) {
    var new_data_length = curr.size - prev.size;
    var new_data = new Buffer(new_data_length);
    fs.open(file, 'r', function(err, fd) {
      if (err) {
        console.log('cannot open test runner log');
      } else {
        fs.read(fd, new_data, 0, new_data_length, prev.size, function(err, bytesRead, buffer) {
          if (err) {
            console.error('cannot read test runner log');
          }
          if (curr.mtime != prev.mtime) {
            console.log(buffer.toString());
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
  }, readNewDataFromFile(stderr_file));
};

var startTinytest = function(scope, port) {
  try {
    //TODO what if multiple tinytest instances
    fs.unlinkSync(stdout_file);
    fs.unlinkSync(stderr_file);
  } catch (e) {
    //dont care, log is already deleted
  }

  //TODO don't asume server-eval package exists!?
  var log_path = path.join(executionPath('server-eval'), 'logs');
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

var createPackageContent = function (name) {
  if(!name || name.length === 0) return;

  var package_dir = path.join(project_path, 'packages', name);

  if(!fs.existsSync(package_dir)) return;

  var package_js = path.join(package_dir, 'package.js');
  var package_js_stream = fs.createWriteStream(package_js);

  package_js_stream.write("Package.describe({summary: '" + name + " package'});");
  package_js_stream.write('\n\n');
  package_js_stream.write("Package.on_use(function(api) {\n\tapi.use('underscore');\n\n\tapi.add_files('" + name + ".js');\n});");
  package_js_stream.end();

  var source_js = path.join(package_dir, name + '.js');
  var source_js_stream = fs.createWriteStream(source_js);

  source_js_stream.write("console.log('" + name + " package loaded');");
  source_js_stream.end();
};

updateMetadata(true);

//helper definitions

ServerEval.helpers['add-package'] = function (scope, args, callback) {
  if(!args || args.length === 0 || args[0] === '') {
    return {
      ____TYPE____: '[Error]',
      err: 'package name required!'
    };
  }

  var name = args[0];
  var package_dir = path.join(project_path, 'packages', name);

  try {
    fs_mkdir(package_dir);

    createPackageContent(name);
  } catch(err) {
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
