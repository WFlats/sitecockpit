sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.Severity", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				severityID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "severityView");
		},

		onSeverityListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("severityList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("severityView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailSeverityTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onAddSeverity: function (oEvent) {
			this.getRouter().getTargets().display("CreateSeverity", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditSeverity: function (oEvent) {
			var oSeverityBC = oEvent.getSource().getBindingContext(),
				sSeverityID = oSeverityBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateSeverity", {
				objectId: sSeverityID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});