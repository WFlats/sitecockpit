/* global QUnit */

QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function() {
	"use strict";

	sap.ui.require([
		"cockpit/Cockpit/test/integration/PhoneJourneys"
	], function() {
		QUnit.start();
	});
});