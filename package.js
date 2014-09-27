Package.describe({
  name: "gandev:server-eval",
  summary: "allows client to run js in server context and more",
  version: "0.6.5",
  git: "https://github.com/gandev/meteor-server-eval.git"
});

Package.onUse(function(api) {
  api.versionsFrom('0.9.0');
  api.versionsFrom('0.9.1');
  api.versionsFrom('0.9.2');
  api.versionsFrom('0.9.3');

  api.use('underscore');
  api.use('mongo');

  api.export('ServerEval');

  api.addFiles('result_format.js', 'server');
  api.addFiles('eval.js', ['client', 'server']);

  api.addFiles('helpers.js', 'server');
  api.addFiles('git_helpers.js', 'server');
});
