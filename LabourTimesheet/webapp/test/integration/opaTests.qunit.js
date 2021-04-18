/* global QUnit */

QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function() {
	"use strict";

	sap.ui.require([
		"labour/timesheet/LabourTimesheet/test/integration/AllJourneys"
	], function() {
		QUnit.start();
	});
});