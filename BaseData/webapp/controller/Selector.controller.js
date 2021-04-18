sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.Selector", {

		onInit: function () {
			// binding with JSON model works, but {table} is not rendered as list item
			var oSelectorModel = new JSONModel();
			oSelectorModel.setData({
				items: [{
					target: "UoMs",
					display: this.getResourceBundle().getText("itemUnitsOfMeasurement")
				}, {
					target: "Disciplines",
					display: this.getResourceBundle().getText("itemDisciplines")
				}, {
					target: "Professions",
					display: this.getResourceBundle().getText("itemProfessions")
				}, {
					target: "Experiences",
					display: this.getResourceBundle().getText("itemExperienceGrades")
				}, {
					target: "Skills",
					display: this.getResourceBundle().getText("itemSkillSets")
				}, {
					target: "Severity",
					display: this.getResourceBundle().getText("itemSeverityTypes")
				}, {
					target: "Quality",
					display: this.getResourceBundle().getText("itemQualityTypes")
				}, {
					target: "Problem",
					display: this.getResourceBundle().getText("itemProblemTypes")
				}, {
					target: "HnS",
					display: this.getResourceBundle().getText("itemHealth&SafetyTypes")
				}]
			});

			this.setModel(oSelectorModel, "selectorModel");
		},

		onSelection: function (oEvent) {
			var oSource = oEvent.getSource(),
				oBC = oSource.getBindingContext("selectorModel"),
				sTarget = oBC.getObject().target,
				oUserModel = this.getModel("userModel");

			// fill user Model only once; fill it here as at onInit the models are not yet avaiöable
			if (!oUserModel.getProperty("/email")) {
				this.getUserInfo("BaseData", "Admin", "");
			}
			this.getRouter().getTargets().display(sTarget);
		}

	});

});