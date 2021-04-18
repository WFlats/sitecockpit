sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.Disciplines", {
		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				disciplineID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "disciplineView");
		},

		onDisciplineListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("disciplinesList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("disciplineView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailDisciplineTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},
		/**
		 *@memberOf base.data.BaseDataEditor.controller.Disciplines
		 */
		onAddDiscipline: function (oEvent) {
			this.getRouter().getTargets().display("CreateDiscipline", {
				objectId: "",
				mode: "Create"
			});
		},

		/**
		 *@memberOf base.data.BaseDataEditor.controller.Disciplines
		 */
		onEditDiscipline: function (oEvent) {
			var oDisciplineBC = oEvent.getSource().getBindingContext(),
				sDisciplineID = oDisciplineBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateDiscipline", {
				objectId: sDisciplineID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}
	});
});