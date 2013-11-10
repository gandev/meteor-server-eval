meteor-server-eval
==================

[meteor](http://www.meteor.com) smartpackage which provides a client api to evaluate expressions on a meteor server. This package was created to use with [meteor-server-console](https://github.com/gandev-de/meteor-server-console)

This package will only run if ROOT_URL includes "localhost" to force a development environment,
because server-eval can be very dangerous in production!

*    exports: "ServerEval" symbol which provides the following functions:
     - .results() / returns a Meteor.Collection cursor with all evaluation results
     - .metadata() / returns a Meteor.Collection cursor with various infos like a list with supported packages
     - .watch() / returns a Meteor.Collection cursor with evaluation results identified by watches
     - .eval(expression, options) / calls "eval" function with the given expression and options
         - supported options: {
             package: "your-package to use as scope",
             watch: true to create or update a watch,
             autocomplete: true if eval for autocomplete, runs _.keys(expr),
             search: ... / eval with autocomplete true only return keys starting with this string}
     - .removeWatch(id) / remove watch by id
     - .clear() / removes all evaluation results

*    the .eval, .clear and .removeWatch functions are realized with it's corresponding Meteor.methods (same args):
     - 'serverEval/eval'
     - 'serverEval/removeWatch'
     - 'serverEval/clear'

*    Unfortunately, to use the package scope functionality you have to add following code snippet to your package:

          Custom.__serverEval = function(expression) {
               return eval(expression);
          };
          
     Custom has to be a arbitrary server api.export("...") in your package.js Package.on_use(function(api){})


     maybe if pull request [https://github.com/meteor/meteor/pull/1207](https://github.com/meteor/meteor/pull/1207)
     or something like this is implemented i can create a source handler plugin to add it automatically.