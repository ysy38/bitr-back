const FixtureMappingMaintainer = require('../services/fixture-mapping-maintainer');

(async () => {
  try {
    const maintainer = new FixtureMappingMaintainer();
    await maintainer.runOnce();
    process.exit(0);
  } catch (e) {
    console.error('❌ FixtureMappingMaintainer cron error:', e);
    process.exit(1);
  }
})();
