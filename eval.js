ServerEval = {
	results: function() {
		return ServerEval._collection.find({}, {
			sort: {
				eval_time: -1
			}
		});
	},
	eval: function(expr, package) {
		Meteor.call('serverEval/eval', expr, package);
	},
	clear: function() {
		Meteor.call('serverEval/clear');
	}
};

if (Meteor.isClient) {
	ServerEval._collection = new Meteor.Collection("eval-results");

	Meteor.subscribe("eval-results");
}

if (Meteor.isServer) {
	ServerEval._collection = new Meteor.Collection("eval-results", {
		connection: null // not persistent
	});

	Meteor.publish("eval-results", function() {
		return ServerEval.results();
	});

	var prettyJSON = function(obj) {
		var cache = [];
		var json = JSON.stringify(obj, function(key, value) {
			var val = value;
			if (_.isObject(value)) {
				if (cache.indexOf(value) !== -1) {
					// Circular reference found
					return {
						____TYPE____: '[Circular]'
					};
				}
				if (_.isFunction(value)) {
					val = _.extend({}, value);
					val.____TYPE____ = "[Function]";
				}
				// Store value in our collection
				cache.push(value);
			}
			return val;
		});
		cache = null; // Enable garbage collection TODO investigate
		return json;
	};

	Meteor.methods({
		'serverEval/eval': function(expr, package) {
			if (!expr || expr.length === 0) return;
			var eval_time = Date.now();
			var scope = "global";
			try {
				var result_raw;
				var _eval = eval;
				if (Package[package]) {
					var package_eval = _.find(_.values(Package[package]), function(exprt) {
						return !!exprt.__serverEval;
					});
					if (package_eval && package_eval.__serverEval) {
						_eval = package_eval.__serverEval;
						scope = package;
					} else {
						scope = "global[" + package + " not supported]";
					}
				} else if (package) {
					scope = "global[no " + package + " package]";
				}

				result_raw = _eval(expr);
				var result_json = prettyJSON(result_raw);
				//console.log(result_raw);
				ServerEval._collection.insert({
					eval_time: eval_time,
					expr: expr,
					scope: scope,
					result: result_json && JSON.parse(result_json)
				});
			} catch (e) {
				ServerEval._collection.insert({
					eval_time: eval_time,
					expr: expr,
					scope: scope,
					error: true,
					result: e.toString()
				});
			}
		},
		'serverEval/clear': function() {
			ServerEval._collection.remove({});
		}
	});
}