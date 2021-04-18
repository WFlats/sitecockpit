sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.Experiences", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				experienceID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "experienceView");
		},

		onExperienceListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("experienceList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("experienceView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailExperienceTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onAddExperience: function (oEvent) {
			this.getRouter().getTargets().display("CreateExperience", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditExperience: function (oEvent) {
			var oExperienceBC = oEvent.getSource().getBindingContext(),
				sExperienceID = oExperienceBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateExperience", {
				objectId: sExperienceID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});