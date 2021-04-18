sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.Problem", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				problemID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "problemView");
		},

		onProblemListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("problemList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("problemView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailProblemTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onAddProblem: function (oEvent) {
			this.getRouter().getTargets().display("CreateProblem", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditProblem: function (oEvent) {
			var oProblemBC = oEvent.getSource().getBindingContext(),
				sProblemID = oProblemBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateProblem", {
				objectId: sProblemID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});