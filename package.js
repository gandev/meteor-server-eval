Package.describe({
  summary: "allows client to run js in server context"
});

Package.on_use(function(api) {
  api.use(['underscore', 'standard-app-packages'], ['client', 'server']);

  api.export('ServerEval');

  api.add_files('eval.js', ['client', 'server']);
});