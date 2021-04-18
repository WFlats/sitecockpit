sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.Selector", {

		onInit: function () {
			// binding with JSON model works, but {table} is not rendered as list item
			var oSelectorModel = new JSONModel();
			oSelectorModel.setData({
				items: [{
					target: "Addresses",
					display: "Addresses"
				}, {
					target: "WageClasses",
					display: "Wage Classes"
				}, {
					target: "Persons",
					display: "People"
				}, {
					target: "Companies",
					display: "Companies"
				}]
			});

			this.setModel(oSelectorModel, "selectorModel");
		},

		onSelection: function (oEvent) {
			var oSource = oEvent.getSource(),
				oBC = oSource.getBindingContext("selectorModel"),
				sTarget = oBC.getObject().target,
				oUserModel = this.getModel("userModel");

			// only now models are available
			if (!oUserModel.getProperty("/email")) {
				this.getUserInfo("MasterData", "Admin", "");
			}

			this.getRouter().getTargets().display(sTarget);
		}

	});

});