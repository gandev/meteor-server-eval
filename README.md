meteor-server-eval
==================

[meteor](http://www.meteor.com) smartpackage which provides a client api to evaluate expressions on a meteor server.
This package was created to use with [meteor-server-console](https://github.com/gandev-de/meteor-server-console).

server-eval is meant to be a development tool! Don't put it in production,
in fact it checks for a ROOT_URL set to something on localhost and logs an error to remind you!

### API

*    exports: "ServerEval" symbol which provides the following functions:
     - __.results()__ returns a Meteor.Collection cursor with all evaluation results
     - __.metadata()__ returns a Meteor.Collection cursor with various infos like a list with supported packages
     - __.watch()__ returns a Meteor.Collection cursor with evaluation results identified by watches
     - __.eval(expression, options)__ calls "eval" function with the given expression and options:
          *    package: "your-package to use as scope",
          *    watch: true to create or update a watch,
          *    ignore_size: true to ignore the 5MB result object limit
          *    autocomplete: true if eval for autocomplete, runs _.keys(expr),
          *    search: ... / eval with autocomplete true only return keys starting with this string
     - __.removeWatch(id)__ remove watch by id
     - __.clear()__ removes all evaluation results
     - __.execute(command, scope, args)__ execute helper (command) function with given arguments array or executes command with node child_process.exec (scope is used to execute in package folder)

*    the .eval, .clear and .removeWatch functions are realized with it's corresponding Meteor.methods (same args):
     - __'serverEval/eval'__
     - __'serverEval/removeWatch'__
     - __'serverEval/clear'__
     - __'serverEval/execute'__

### Caveat

*    Unfortunately, to use the package scope functionality you have to add following code snippet to your package:

          Custom.__serverEval = function(expression) {
               return eval(expression);
          };
          
     Custom has to be a arbitrary server api.export('...') in your package.js Package.on_use(function(api){})


     maybe if pull request [https://github.com/meteor/meteor/pull/1207](https://github.com/meteor/meteor/pull/1207)
     or something like this is implemented i can create a source handler plugin to add it automatically.
