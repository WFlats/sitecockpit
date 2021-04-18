sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.OrgLevels", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				mode: "",
				orgLevelID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "orgLevelView");
		},

		onOrgLevelListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("orgLevelList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("orgLevelView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("orgLevelTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onRefresh: function () {
			this.byId("orgLevelList").getBinding("items").refresh();
		},

		onAddOrgLevel: function (oEvent) {
			this.getRouter().getTargets().display("CreateOrgLevel", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditOrgLevel: function (oEvent) {
			var oCompanyBC = oEvent.getSource().getBindingContext(),
				sCompanyID = oCompanyBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateOrgLevel", {
				objectId: sCompanyID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});