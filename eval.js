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
		connection: null
	});

	Meteor.publish("eval-results", function() {
		return ServerEval.results();
	});

	var prettyJSON = function(obj) {
		var cache = [];
		var json = JSON.stringify(obj, function(key, value) {
			if (_.isFunction(value)) {
				value = "[Function]";
			} else if (_.isObject(value)) {
				if (cache.indexOf(value) !== -1) {
					// Circular reference found, discard key
					return;
				}
				// Store value in our collection
				cache.push(value);
			}
			return value;
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