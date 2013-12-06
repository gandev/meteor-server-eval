var exec = Npm.require('child_process').exec;

executeGit = function(args, callback) {
  var cmd = 'git -c color.ui=always ' + args.join(' ');

  exec(cmd, {
    cwd: project_path
  }, function(err, stdout, stderr) {
    var result;
    if (err) {
      result = err;
    } else if (stderr) {
      result = {
        ____TYPE____: '[Error]',
        err: stderr
      };
    } else {
      result = {
        output: stdout
      };

      if (isLoggingActive) {
        console.log(stdout);
        return;
      }
    }

    if (typeof callback === 'function') {
      callback(result);
    } else {
      Log.warning('No callback defined!');
    }
  });
};

ServerEval.helpers.git = function(callback, args) {
  executeGit(args);
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