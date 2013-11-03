meteor-server-eval
==================

[meteor](http://www.meteor.com) smartpackage which provides a client api to evaluate expressions on a meteor server. This package was created to use with [meteor-server-console](https://github.com/gandev-de/meteor-server-console)

*    exports: "ServerEval" symbol which provides the following functions:
     - .results() / returns a Meteor.Collection cursor with all evaluation results
     - .metadata() / returns a Meteor.Collection cursor with various infos like a list with supported packages
     - .eval(expression, package) / calls "eval" function with the given expression in package context if supported
     - .clear() / removes all evaluation results

*    the .eval and .clear functions are realized with it's corresponding Meteor.methods:
     - 'serverEval/eval' / parameter is an expression string as well as the package name it should run in
     - 'serverEval/clear'

*    Unfortunately, to use the package scope functionality you have to add following code snippet to your package:

          Custom.__serverEval = function(expression) {
          	return eval(expression);
          };
          
     Custom has to be a arbitrary api.export("...") in your package.js Package.on_use(function(api){})


     maybe if pull request [https://github.com/meteor/meteor/pull/1207](https://github.com/meteor/meteor/pull/1207)
     or something like this is implemented i can create a source handler plugin to add it automatically.
