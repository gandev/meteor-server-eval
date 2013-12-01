var glob = Npm.require('glob');
var path = Npm.require('path');

//js-git
var platform = Npm.require('git-node-platform');
var jsGit = Npm.require('js-git');
var fsDb = Npm.require('git-fs-db')(platform);
var fs = platform.fs;

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

var createFileTreeSync = function(dir) {
  var result = {};
  var files = glob.sync(dir, {
    cwd: project_path
  });

  var addToResult = function(file, path) {
    if (path.length === 0) {
      result[file] = 'file';
    }

    var obj = result;
    for (var i = 0; i < path.length; i++) {
      var key = path[i];
      if (_.isEmpty(key)) continue;

      if (!(key in obj) || _.isString(obj[key])) {
        obj[key] = {};
      }

      obj = obj[key];

      if (path.length - 1 === i) {
        obj[file] = 'file';
      }
    }
  };

  for (var i = 0; i < files.length; i++) {
    var file_path = files[i].split(path.sep);
    var file = file_path.pop();

    addToResult(file, file_path);
  }
  return result;
};

var creatGitTree = function(hash, callback) {
  var git_tree = {};

  // Create a filesystem backed bare repo
  var repo = jsGit(fsDb(fs(project_path + '/.git')));
  repo.logWalk(hash, function(err, log) {
    if (err) throw err;
    var shallow;

    function onRead(err, commit) {
      if (err) throw err;
      if (!commit) return logEnd(shallow);
      if (commit.last) shallow = true;
      var commit_date = addCommit(commit);
      repo.treeWalk(commit.tree, function(err, tree) {
        if (err) throw err;

        function onEntry(err, entry) {
          if (err) throw err;

          if (!entry) {
            return log.read(onRead);
          }
          addEntry(entry, commit_date);
          return tree.read(onEntry);
        }

        tree.read(onEntry);
      });
    }

    return log.read(onRead);
  });

  function addCommit(commit) {
    var author = commit.author.name;
    var message = commit.message;
    var date = commit.author.date.toString();

    git_tree[date] = {
      author: author,
      message: message
    };

    return date;
  }

  function addEntry(entry, commit_date) {
    var path = entry.path;
    var hash = entry.hash;
    var entry_obj = {
      path: path,
      hash: hash
    };

    if (git_tree[commit_date].entries) {
      git_tree[commit_date].entries.push(entry_obj);
    } else {
      git_tree[commit_date].entries = [entry_obj];
    }
  }

  function logEnd(shallow) {
    var message = shallow ? "End of shallow record." : "Beginning of history";

    if (typeof callback === 'function') {
      callback.call(null, git_tree);
    }
  }
};

//helper definitions

ServerEval.helpers.listFiles = function(callback, path) {
  return createFileTreeSync(path);
};

ServerEval.helpers.updateMetadata = function() {
  updateMetadata();
};

ServerEval.helpers.gitLog = function(callback, hash) {
  creatGitTree(hash || 'HEAD', callback);
};