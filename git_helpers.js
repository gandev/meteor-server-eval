var exec = Npm.require('child_process').exec;

executeGit = function(args, callback) {
  if (typeof callback !== 'function') {
    Log.error("Result callback necessary!");
    return;
  }

  var cmd = 'git -c color.ui=always ' + args.join(' ');

  exec(cmd, {
    cwd: project_path
  }, function(err, stdout, stderr) {
    var err_result;
    if (err) {
      err_result = err;
    } else if (stderr) {
      //TODO test
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

ServerEval.helpers.git = function(callback, args) {
  executeGit(args, callback);
};

ServerEval.helpers.gitStatus = function(callback) {
  executeGit(['status'], callback);
};

ServerEval.helpers.gitDiff = function(callback) {
  executeGit(['diff'], callback);
};

ServerEval.helpers.gitLog = function(callback) {
  executeGit(['log'], callback);
};

ServerEval.helpers.gitReflog = function(callback) {
  executeGit(['reflog'], callback);
};

ServerEval.helpers.gitBranch = function(callback) {
  executeGit(['branch'], callback);
};