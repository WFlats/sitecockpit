/*global QUnit*/

sap.ui.define([
	"base/data/BaseData/controller/Disciplines.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Disciplines Controller");

	QUnit.test("I should test the Disciplines controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});