sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/GroupHeaderListItem"
], function (BaseController, JSONModel, GroupHeaderListItem) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.Skills", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				skillID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "skillView");
		},

		onSkillListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("skillList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("skillView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailSkillTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		getDiscipline: function (oContext) {
			var oDiscipline = oContext.getProperty("profession/discipline"),
				oGroup,
				sNoDiscipline = this.getResourceBundle().getText("noDisciplineAssigned");

			if (oDiscipline) {
				oGroup = {
					key: oDiscipline.code,
					description: oDiscipline.description
				};
			} else {
				oGroup = {
					key: undefined,
					description: sNoDiscipline
				};
			}
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText = oGroup.key + " " + oGroup.description;
			return new GroupHeaderListItem({
				title: sText,
				upperCase: false
			});
		},

		onAddSkill: function (oEvent) {
			this.getRouter().getTargets().display("CreateSkill", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditSkill: function (oEvent) {
			var oSkillBC = oEvent.getSource().getBindingContext(),
				sSkillID = oSkillBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateSkill", {
				objectId: sSkillID,
				mode: "Edit"
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});