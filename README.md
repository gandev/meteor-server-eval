meteor-server-eval
==================

[meteor](http://www.meteor.com) smartpackage which provides a client api to evaluate expressions on a meteor server. This package was created to use with [meteor-server-console](https://github.com/gandev-de/meteor-server-console)

*    exports: "ServerEval" symbol which provides theses Meteor.methods:
     - .results() / returns a Meteor.Collection cursor with all evaluation results
     - .eval(expression) / calls "eval" function with the given expression in package context
     - .clear() / removes all evaluation results
