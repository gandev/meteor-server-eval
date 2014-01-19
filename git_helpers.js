executeGit = function(scope, args, callback) {
	var cmd = 'git -c color.ui=always';

	executeCommand(cmd, scope, args, callback);
};

ServerEval.helpers.git = function(scope, args, callback) {
	executeGit(scope, args, callback);
};

ServerEval.helpers.gitStatus = function(scope, args, callback) {
	executeGit(scope, ['status'], callback);
};

ServerEval.helpers.gitDiff = function(scope, args, callback) {
	executeGit(scope, ['diff'], callback);
};

ServerEval.helpers.gitLog = function(scope, args, callback) {
	executeGit(scope, ['log'], callback);
};

ServerEval.helpers.gitReflog = function(scope, args, callback) {
	executeGit(scope, ['reflog'], callback);
};

ServerEval.helpers.gitBranch = function(scope, args, callback) {
	executeGit(scope, ['branch'], callback);
};