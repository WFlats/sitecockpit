/*global QUnit*/

sap.ui.define([
	"card/Analytics/CardAnalytics/controller/Cards.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Cards Controller");

	QUnit.test("I should test the Cards controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});