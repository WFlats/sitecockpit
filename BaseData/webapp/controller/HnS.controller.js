sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.HnS", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				HnSID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "HnSView");
		},

		onHnSListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("HnSList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("HnSView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailHnSTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onAddHnS: function (oEvent) {
			this.getRouter().getTargets().display("CreateHnS", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditHnS: function (oEvent) {
			var oHnSBC = oEvent.getSource().getBindingContext(),
				sHnSID = oHnSBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateHnS", {
				objectId: sHnSID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});