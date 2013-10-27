ServerEval = {
	results: function() {
		return ServerEval._collection.find({}, {
			sort: {
				eval_time: -1
			}
		});
	},
	eval: function(expr) {
		Meteor.call('serverEval/eval', expr);
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
					// Circular reference found, discard key
					return '[CIRCULAR Reference]';
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
		'serverEval/eval': function(expr) {
			if (!expr || expr.length === 0) return;
			var eval_time = Date.now();
			try {
				var result_raw = eval(expr);
				//console.log(result_raw);
				ServerEval._collection.insert({
					eval_time: eval_time,
					expr: expr,
					type: typeof result_raw,
					result: JSON.parse(prettyJSON(result_raw))
				});
			} catch (e) {
				ServerEval._collection.insert({
					eval_time: eval_time,
					expr: expr,
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