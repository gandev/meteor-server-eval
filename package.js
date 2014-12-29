Package.describe({
  name: "gandev:server-eval",
  summary: "allows client to run js in server context and more",
  version: "0.6.6",
  git: "https://github.com/gandev/meteor-server-eval.git",
  debugOnly: true
});

Npm.depends({
  'esprima': '1.2.2'
});

Package.onUse(function(api) {
  api.versionsFrom('1.0');

  api.use('underscore');
  api.use('mongo');

  api.export('ServerEval');

  api.addFiles('result_format.js', 'server');
  api.addFiles('eval.js', ['client', 'server']);

  api.addFiles('helpers.js', 'server');
  api.addFiles('git_helpers.js', 'server');
});