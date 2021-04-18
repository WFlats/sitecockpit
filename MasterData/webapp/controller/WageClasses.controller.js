sap.ui.define([
	"./BaseController",
	"../model/formatter",
	"sap/ui/model/json/JSONModel"
], function (BaseController, formatter, JSONModel) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.WageClasses", {

		formatter: formatter,

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				mode: "",
				wageClassID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "wageClassView");
		},

		onWageClassListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("wageClassList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("wageClassView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("wageClassTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onRefresh: function () {
			this.byId("wageClassList").getBinding("items").refresh();
		},

		onAddWageClass: function (oEvent) {
			this.getRouter().getTargets().display("CreateWageClass", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditWageClass: function (oEvent) {
			var oWageClassBC = oEvent.getSource().getBindingContext(),
				sWageClassID = oWageClassBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateWageClass", {
				objectId: sWageClassID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});