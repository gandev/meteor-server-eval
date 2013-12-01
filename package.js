Npm.depends({
  'glob': '3.2.7',
  'js-git': '0.6.1',
  'git-node-platform': '0.1.4',
  'git-fs-db': '0.2.0',
  'git-wrapper': '0.1.1'
});

Package.describe({
  summary: "allows client to run js in server context"
});

Package.on_use(function(api) {
  api.use(['standard-app-packages'], ['client', 'server']);

  api.export('ServerEval');

  api.add_files('result_format.js', 'server');
  api.add_files('eval.js', ['client', 'server']);
  api.add_files('helpers.js', 'server');
});