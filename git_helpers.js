executeGit = function(args, callback) {
  var cmd = 'git -c color.ui=always';

  executeCommand(cmd, args, callback);
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