Package.describe({
  summary: "allows client to run js in server context"
});

Package.on_use(function(api) {
  api.use(['standard-app-packages'], ['client', 'server']);

  api.export('ServerEval');

  api.add_files('result_format.js', 'server');
  api.add_files('eval.js', ['client', 'server']);

  api.add_files('helpers.js', 'server');
  api.add_files('git_helpers.js', 'server');
});