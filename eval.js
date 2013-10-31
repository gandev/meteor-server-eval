ServerEval = {
	version: "0.3",
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
	eval: function(expr, package) {
		Meteor.call('serverEval/eval', expr, package);
	},
	clear: function() {
		Meteor.call('serverEval/clear');
	}
};

if (Meteor.isClient) {
	ServerEval._results = new Meteor.Collection("server-eval-results");
	Meteor.subscribe("server-eval-results");

	ServerEval._metadata = new Meteor.Collection("server-eval-metadata");
	Meteor.subscribe("server-eval-metadata");
}

if (Meteor.isServer) {
	ServerEval._results = new Meteor.Collection("server-eval-results", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-results", function() {
		return ServerEval.results();
	});

	ServerEval._metadata = new Meteor.Collection("server-eval-metadata", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-metadata", function() {
		return ServerEval.metadata();
	});

	Meteor.startup(function() {
		var packages = _.keys(Package);
		var supported_packages = _.filter(packages, function(pkg) {
			return !!findEval(pkg);
		});
		ServerEval._metadata.insert({
			version: ServerEval.version,
			packages: packages,
			supported_packages: supported_packages
		});
	});

	//create json from object, filters circular dependencies 
	//and adds custom ____TYPE___ property
	var prettyJSON = function(obj) {
		var cache = [];
		var json = JSON.stringify(obj, function(key, value) {
			var prettyValue = value;
			if (value instanceof Error) {
				var stacktrace = value.stack && value.stack.split("\n") || [];
				prettyValue = {
					____TYPE____: '[Error]',
					err: value.toString(),
					stack: stacktrace.slice(1)
				};
			} else if (_.isObject(value)) {
				if (cache.indexOf(value) !== -1) {
					// Circular reference found
					prettyValue = {
						____TYPE____: '[Circular]'
					};
				} else if (_.isFunction(value)) {
					prettyValue = _.extend({}, value);
					prettyValue.____TYPE____ = "[Function]";
				}
				// Store value in our collection
				cache.push(value);
			}
			return prettyValue;
		});
		cache = null; // Enable garbage collection TODO investigate
		return json;
	};


	//checks if eval function in package scope available
	var findEval = function(package) {
		if (Package[package]) {
			var supported_package = _.find(_.values(Package[package]), function(exprt) {
				return !!exprt.__serverEval;
			});
			return supported_package && supported_package.__serverEval;
		}
	};

	Meteor.methods({
		'serverEval/eval': function(expr, package) {
			if (!expr || expr.length === 0) return;

			var eval_time = Date.now();
			var scope = "global";
			var result_json;
			try {
				var result_raw;
				var _eval = eval;
				if (Package[package]) {
					var scoped_eval = findEval(package);
					if (scoped_eval) {
						_eval = scoped_eval; //use scoped eval
						scope = package;
					} else {
						scope = "global[" + package + " not supported]";
					}
				} else if (package) {
					scope = "global[no " + package + " package]";
				}
				//run eval in package scope / fallback to eval in current scope (called global)
				result_raw = _eval(expr);
				result_json = prettyJSON(result_raw);
			} catch (e) {
				result_json = prettyJSON(e);
			}

			ServerEval._results.insert({
				eval_time: eval_time,
				expr: expr,
				scope: scope,
				result: result_json && JSON.parse(result_json)
			});
		},
		'serverEval/clear': function() {
			ServerEval._results.remove({});
		}
	});
}