ServerEval = {
	version: "0.4",
	results: function() {
		return ServerEval._results.find({}, {
			sort: {
				eval_time: -1
			}
		});
	},
	metadata: function() {
		return ServerEval._metadata.find();
	},
	watch: function() {
		return ServerEval._watch.find();
	},
	removeWatch: function(id) {
		Meteor.call('serverEval/removeWatch', id);
	},
	eval: function(expr, options) {
		Meteor.call('serverEval/eval', expr, options);
	},
	clear: function() {
		Meteor.call('serverEval/clear');
	}
};

if (Meteor.isClient) {
	ServerEval._metadata = new Meteor.Collection("server-eval-metadata");
	Meteor.subscribe("server-eval-metadata");

	ServerEval._watch = new Meteor.Collection("server-eval-watch");
	Meteor.subscribe("server-eval-watch");

	ServerEval._results = new Meteor.Collection("server-eval-results");
	Meteor.subscribe("server-eval-results");
}

if (Meteor.isServer) {
	ServerEval._metadata = new Meteor.Collection("server-eval-metadata", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-metadata", function() {
		return ServerEval.metadata();
	});

	ServerEval._watch = new Meteor.Collection("server-eval-watch");
	Meteor.publish("server-eval-watch", function() {
		return ServerEval.watch();
	});

	ServerEval._results = new Meteor.Collection("server-eval-results", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-results", function() {
		return ServerEval.results();
	});

	//checks if eval function in package scope available
	var findEval = function(package) {
		if (Package[package]) {
			var supported_package = _.find(_.values(Package[package]), function(exprt) {
				return !!exprt.__serverEval;
			});
			return supported_package && supported_package.__serverEval;
		}
	};

	Meteor.startup(function() {
		//check for localhost to force dev development over production
		if (__meteor_runtime_config__) {
			if (__meteor_runtime_config__.ROOT_URL.indexOf('localhost') === -1) {
				Log.error("FATAL ERROR: METEOR-SERVER-EVAL MUST NOT RUN IN PRODUCTION");
			}
		}

		//gather metadata and publish them
		var packages = _.keys(Package);
		var supported_packages = _.filter(packages, function(pkg) {
			return !!findEval(pkg);
		});

		ServerEval._metadata.insert({
			version: ServerEval.version,
			packages: packages,
			supported_packages: supported_packages
		});

		//refresh watches
		var watches = ServerEval._watch.find().fetch();
		_.each(watches, function(watch) {
			Meteor.call('serverEval/eval', watch.expr, {
				'package': watch.watch_scope,
				watch: true
			});
		});
	});

	Meteor.methods({
		'serverEval/eval': function(expr, options) {
			if (!expr || expr.length === 0) return;

			options = options || {};
			var pkg = options.package;

			var eval_time = Date.now();
			var scope = "server-eval";
			var result;
			var _eval = function(expr) {
				//without wrapping function other scope e.g. Npm undefined
				return eval(expr);
			};

			//determine scope
			if (Package[pkg]) {
				var scoped_eval = findEval(pkg);
				if (scoped_eval) {
					_eval = scoped_eval; //use scoped eval
					scope = pkg;
				} else {
					scope = "server-eval[" + pkg + " not supported]";
				}
			} else if (pkg) {
				scope = "server-eval[no " + pkg + " package]";
			}

			var eval_exec_time = Date.now();
			try {
				//run eval in package scope / fallback to eval in current scope
				result = _eval(options.autocomplete ? '_.keys(' + expr + ')' : expr);
			} catch (e) {
				//error in eval
				result = e;
			}
			eval_exec_time = Date.now() - eval_exec_time;

			//TODO get rid of some data automatically!?
			//because of serious performance issue with really big results
			var result_obj = {
				eval_time: eval_time,
				eval_exec_time: eval_exec_time,
				expr: expr,
				scope: scope,
				result: prettyResult(result)
			};

			//match keys to autocomplete search
			if (options.autocomplete && result_obj.result.____TYPE____ !== '[Error]') {
				var completions = [];
				_.each(result_obj.result, function(value) {
					if (!options.search || value.match(new RegExp("^" + options.search))) {
						completions.push(value);
					}
				});
				result_obj.result = completions;
				result_obj.autocomplete = true;
			} else if (options.autocomplete) {
				result_obj.result.stack = null;
				result_obj.result.err = "autocomplete failed, no object";
			}

			//console.time("insert new result time");
			if (options.watch) {
				result_obj.watch_scope = pkg;
				result_obj.result = JSON.stringify(result_obj);
				//create new or update result for watched expression
				ServerEval._watch.upsert({
					expr: expr,
					watch_scope: pkg
				}, result_obj);
			} else {
				ServerEval._results.insert(result_obj);
			}
			//console.timeEnd("insert new result time");
		},
		'serverEval/clear': function() {
			ServerEval._results.remove({});
		},
		'serverEval/removeWatch': function(id) {
			ServerEval._watch.remove({
				_id: id
			});
		}
	});
}