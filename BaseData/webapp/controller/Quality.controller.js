sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.Quality", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				qualityID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "qualityView");
		},

		onQualityListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("qualityList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("qualityView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailQualityTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onAddQuality: function (oEvent) {
			this.getRouter().getTargets().display("CreateQuality", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditQuality: function (oEvent) {
			var oQualityBC = oEvent.getSource().getBindingContext(),
				sQualityID = oQualityBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateQuality", {
				objectId: sQualityID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});