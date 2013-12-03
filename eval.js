ServerEval = {
	version: "0.4",
	helpers: {},
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
	executeHelper: function(command, args) {
		Meteor.apply('serverEval/executeHelper', command, args);
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
	ServerEval._metadata = new Meteor.Collection("server-eval-metadata");
	Meteor.publish("server-eval-metadata", function() {
		updateMetadata(true);
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

	Meteor.startup(function() {
		//term = new Package['hypernal'].Terminal(); //TODO

		//check for localhost to force dev development over production
		if (__meteor_runtime_config__) {
			if (__meteor_runtime_config__.ROOT_URL.indexOf('localhost') === -1) {
				Log.error("FATAL ERROR: METEOR-SERVER-EVAL MUST NOT RUN IN PRODUCTION");
			}
		}

		//refresh watches
		var watches = ServerEval._watch.find().fetch();
		_.each(watches, function(watch) {
			Meteor.call('serverEval/eval', watch.expr, {
				'package': watch.watch_scope,
				watch: true
			});
		});
	});

	var eval_expression = function(expr, pkg, autocomplete) {
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
			result = _eval(autocomplete ? '_.keys(' + expr + ')' : expr);
		} catch (e) {
			//error in eval
			result = e;
		}
		eval_exec_time = Date.now() - eval_exec_time;

		//TODO get rid of some data automatically!?
		//because of serious performance issue with really big results
		return {
			eval_time: Date.now(),
			eval_exec_time: eval_exec_time,
			expr: expr,
			scope: scope,
			result: prettyResult(result)
		};
	};

	Meteor.methods({
		'serverEval/eval': function(expr, options) {
			if (!expr || expr.length === 0) return;

			options = options || {};
			var pkg = options.package;
			var autocomplete = options.autocomplete;

			var result_obj = eval_expression(expr, pkg, autocomplete);

			_.extend(result_obj, options);

			//match keys to autocomplete search
			if (autocomplete && result_obj.result.____TYPE____ !== '[Error]') {
				var completions = [];
				_.each(result_obj.result, function(value) {
					if (!options.search || value.match(new RegExp("^" + options.search))) {
						completions.push(value);
					}
				});
				result_obj.result = completions;
			} else if (autocomplete) {
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
		'serverEval/executeHelper': function(command, args) {
			if (!command || command.length < 2) return;

			var helper = command.substr(1);
			var eval_exec_time = Date.now();
			var result;

			var new_result = function(result) {
				eval_exec_time = Date.now() - eval_exec_time;

				ServerEval._results.insert({
					eval_time: Date.now(),
					eval_exec_time: eval_exec_time,
					expr: command + ' ' + args.join(' '),
					scope: helper,
					internal: true,
					result: prettyResult(result)
				});
			};

			try {
				if (typeof ServerEval.helpers[helper] === 'function') {
					result = ServerEval.helpers[helper](new_result, args);
					if (!result) {
						return; //async
					}
				} else {
					result = {
						____TYPE____: "[Error]",
						err: command + " not supported!"
					};
				}
			} catch (e) {
				//error in eval
				result = e;
			}
			new_result(result);
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